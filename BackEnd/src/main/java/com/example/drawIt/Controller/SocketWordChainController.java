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
        state.start(startWord, users);

        broadcastState(roomId, "START",
                Map.of("message", "끝말잇기 게임이 시작되었습니다."));
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

        Map<String, Object> extra = new HashMap<>();
        extra.put("submitUserId", userId);
        extra.put("submitNickname", nickname);
        extra.put("submitWord", word);

        if (!wordChainGameManager.existsInDictionary(word)) {
            extra.put("message", "사전에 없는 단어입니다.");
            broadcastState(roomId, "REJECT", extra);
            return;
        }

        if (!state.submit(userId, word)) {
            extra.put("message", "규칙에 맞지 않는 단어입니다.");
            broadcastState(roomId, "REJECT", extra);
            return;
        }

        // ✅ 정답 → 점수 +10
        state.addScore(userId, 10);

        // 턴 변경
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
}
