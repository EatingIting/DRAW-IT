package com.example.drawIt.Controller;

import com.example.drawIt.Domain.WordChainGameManager;
import com.example.drawIt.Domain.WordChainState;
import com.example.drawIt.Service.LobbyService;
import com.example.drawIt.Socket.LobbyUserStore;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.*;
import java.util.stream.Collectors;

@Controller
@RequiredArgsConstructor
public class SocketWordChainController {

    private final SimpMessagingTemplate messagingTemplate;
    private final WordChainGameManager wordChainGameManager;
    private final LobbyUserStore lobbyUserStore;
    private final LobbyService lobbyService;

    private List<WordChainState.UserSnapshot> currentUsers(String roomId) {
        List<Map<String, Object>> users = lobbyUserStore.getUsers(roomId);
        return users.stream()
                .map(u -> new WordChainState.UserSnapshot(
                        String.valueOf(u.get("userId")),
                        String.valueOf(u.get("nickname"))
                ))
                .collect(Collectors.toList());
    }

    private void broadcastState(String roomId, String lastAction, Map<String, Object> extra) {
        WordChainState state = wordChainGameManager.getOrCreate(roomId);

        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "WORD_CHAIN_STATE");
        payload.put("started", state.isStarted());
        payload.put("currentWord", state.getCurrentWord());
        payload.put("playerIds", state.getPlayerIds());
        payload.put("nickById", state.getNickById());
        payload.put("turnUserId", state.getTurnUserId());
        payload.put("round", state.getRound());
        payload.put("turnStartAt", state.getTurnStartAt());
        payload.put("turnTimeLimit", state.getTurnTimeLimitSeconds());
        payload.put("lastAction", lastAction);

        // ✅ 점수 전달
        payload.put("scoreByUserId", state.getScoreByUserId());

        if (extra != null) payload.putAll(extra);

        messagingTemplate.convertAndSend("/topic/wordchain/" + roomId, payload);
    }

    /* =========================
       게임 시작
    ========================= */
    @MessageMapping("/wordchain/{roomId}/start")
    public void start(@DestinationVariable String roomId) {

        WordChainState state = wordChainGameManager.getOrCreate(roomId);

        state.syncPlayers(currentUsers(roomId));
        List<WordChainState.UserSnapshot> users = currentUsers(roomId);

        if (users.size() < 2) {
            messagingTemplate.convertAndSend(
                    "/topic/wordchain/" + roomId,
                    Map.of("type", "START_DENIED")
            );
            return;
        }

        String startWord = wordChainGameManager.pickFirstWord();

        // ✅ "즉시 started=true" + "turnStartAt=now+3000"
        state.startWithDelay(startWord, users, 3000);

        broadcastState(roomId, "START", Map.of(
                "message", "게임 시작",
                "turnStartAt", state.getTurnStartAt()
        ));
    }

    /* =========================
       상태 동기화
    ========================= */
    @MessageMapping("/wordchain/{roomId}/sync")
    public void sync(@DestinationVariable String roomId) {

        WordChainState state = wordChainGameManager.getOrCreate(roomId);

        if (state.isTimeOver(System.currentTimeMillis())) {
            state.finish();
            messagingTemplate.convertAndSend(
                    "/topic/wordchain/" + roomId,
                    Map.of("type", "WORD_CHAIN_END", "reason", "TIME_OVER")
            );
            return;
        }

        state.syncPlayers(currentUsers(roomId));
        broadcastState(roomId, null, null);
    }

    /* =========================
       단어 제출
    ========================= */
    @MessageMapping("/wordchain/{roomId}/submit")
    public void submit(
            @DestinationVariable String roomId,
            @Payload Map<String, Object> dto
    ) {
        String userId = String.valueOf(dto.get("userId"));
        String nickname = String.valueOf(dto.getOrDefault("nickname", ""));
        String word = String.valueOf(dto.get("word")).trim();

        WordChainState state = wordChainGameManager.getOrCreate(roomId);
        state.syncPlayers(currentUsers(roomId));

        // ✅ 말풍선 (성공/실패 상관없이)
        messagingTemplate.convertAndSend(
                "/topic/chat/bubble/" + roomId,
                Map.of(
                        "type", "CHAT_BUBBLE",
                        "userId", userId,
                        "message", word
                )
        );

        // ✅ 공통 extra 객체 (여기서 한 번만 선언)
        Map<String, Object> extra = new HashMap<>();
        extra.put("submitUserId", userId);
        extra.put("submitNickname", nickname);
        extra.put("submitWord", word);

        // ⏳ 모달 3초 동안 제출 방지
        long now = System.currentTimeMillis();
        if (state.isStarted() && now < state.getTurnStartAt()) {
            extra.put("message", "잠시 후 게임이 시작됩니다.");
            broadcastState(roomId, "REJECT", extra);
            return;
        }

        // ❌ 사전에 없는 단어
        if (!wordChainGameManager.existsInDictionary(word)) {
            extra.put("message", "사전에 없는 단어입니다.");
            broadcastState(roomId, "REJECT", extra);
            return;
        }

        // ❌ 규칙 위반
        if (!state.submit(userId, word)) {
            extra.put("message", "규칙에 맞지 않는 단어입니다.");
            broadcastState(roomId, "REJECT", extra);
            return;
        }

        // ✅ 정답 처리
        state.addScore(userId, 10);
        state.decreaseTurnLimit();
        state.onNextTurn();

        extra.put("message", "통과!");
        broadcastState(roomId, "ACCEPT", extra);
    }

    /* =========================
       채팅
    ========================= */
    @MessageMapping("/wordchain/{roomId}/chat")
    public void chat(
            @DestinationVariable String roomId,
            @Payload Map<String, Object> dto
    ) {
        String userId = String.valueOf(dto.get("userId"));
        String message = String.valueOf(dto.get("message")).trim();

        if (message.isEmpty()) return;

        messagingTemplate.convertAndSend(
                "/topic/chat/bubble/" + roomId,
                Map.of(
                        "type", "CHAT_BUBBLE",
                        "userId", userId,
                        "message", message
                )
        );
    }

    @MessageMapping("/wordchain/{roomId}/leave")
    public void leaveWordChain(
            @DestinationVariable String roomId,
            @Payload Map<String, String> payload
    ) {
        String userId = payload.get("userId");

        WordChainState state = wordChainGameManager.get(roomId);
        // 끝말잇기 상태가 없으면(게임 시작 전이거나 이미 종료) 여기서는 할 게 없음
        if (state == null) return;

        // 남은 유저(leave는 SocketController에서 실제로 제거됨. 여기서는 "현재 store 기준"으로 판단)
        List<Map<String, Object>> remainUsers = lobbyUserStore.getUsers(roomId);

        /* =========================
           케이스 A) 게임 중 + 1명만 남음 → 게임 종료 + 방 삭제
        ========================= */
        if (state.isStarted() && remainUsers.size() < 2) {

            messagingTemplate.convertAndSend(
                    "/topic/wordchain/" + roomId,
                    Map.of(
                            "type", "WORD_CHAIN_END",
                            "reason", "NOT_ENOUGH_PLAYERS"
                    )
            );

            wordChainGameManager.remove(roomId);
//            lobbyUserStore.removeRoom(roomId);

            return;
        }

        /* =========================
           케이스 B) 턴 유저가 나감 → 랜덤 유저에게 턴 이동 + 모달 이벤트
        ========================= */
        if (state.isStarted() && userId != null && userId.equals(state.getTurnUserId())) {

            List<String> ids = remainUsers.stream()
                    .map(u -> (String) u.get("userId"))
                    .toList();

            if (!ids.isEmpty()) {
                String nextTurnUserId = ids.get(new Random().nextInt(ids.size()));

                state.setTurnUserId(nextTurnUserId);
                state.setTurnStartAt(System.currentTimeMillis());

                messagingTemplate.convertAndSend(
                        "/topic/wordchain/" + roomId,
                        Map.of(
                                "type", "WORD_CHAIN_TURN_USER_LEFT",
                                "newTurnUserId", nextTurnUserId,
                                "turnStartAt", state.getTurnStartAt()
                        )
                );
            }
        }
    }
}
