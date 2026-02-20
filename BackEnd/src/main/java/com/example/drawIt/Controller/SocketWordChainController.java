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

        // ???먯닔 ?꾨떖
        payload.put("scoreByUserId", state.getScoreByUserId());

        if (extra != null) payload.putAll(extra);

        messagingTemplate.convertAndSend("/topic/wordchain/" + roomId, payload);
    }

    /* =========================
       寃뚯엫 ?쒖옉
    ========================= */
    @MessageMapping("/wordchain/{roomId}/start")
    public void start(@DestinationVariable("roomId") String roomId) {

        WordChainState state = wordChainGameManager.getOrCreate(roomId);

        state.syncPlayers(currentUsers(roomId));
        List<WordChainState.UserSnapshot> users = currentUsers(roomId);

        if (users.size() < 2) {
            messagingTemplate.convertAndSend(
                    "/topic/wordchain/" + roomId,
                    Map.of("type", "START_DENIED")
            );
            messagingTemplate.convertAndSend(
                    "/topic/lobby/" + roomId,
                    Map.of(
                            "type", "GAME_START_DENIED",
                            "reason", "NOT_ENOUGH_PLAYERS"
                    )
            );
            return;
        }

        String startWord;
        try {
            startWord = wordChainGameManager.pickFirstWord();
        } catch (Exception e) {
            messagingTemplate.convertAndSend(
                    "/topic/wordchain/" + roomId,
                    Map.of("type", "START_DENIED", "reason", "WORD_NOT_FOUND")
            );
            return;
        }

        // ??"利됱떆 started=true" + "turnStartAt=now+3000"
        state.startWithDelay(startWord, users, 3000);
        lobbyService.markGameStarted(roomId);

        broadcastState(roomId, "START", Map.of(
                "message", "게임 시작",
                "turnStartAt", state.getTurnStartAt()
        ));
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "GAME_START",
                "mode", "WORD_CHAIN",
                "gameStarted", true
        ));
    }

    /* =========================
       ?곹깭 ?숆린??
    ========================= */
    @MessageMapping("/wordchain/{roomId}/sync")
    public void sync(@DestinationVariable("roomId") String roomId) {

        WordChainState state = wordChainGameManager.getOrCreate(roomId);

        if (state.isTimeOver(System.currentTimeMillis())) {
            wordChainGameManager.handleTimeOver(roomId, state);
            return;
        }

        state.syncPlayers(currentUsers(roomId));
        broadcastState(roomId, null, null);
    }

    /* =========================
       ?⑥뼱 ?쒖텧
    ========================= */
    @MessageMapping("/wordchain/{roomId}/submit")
    public void submit(
            @DestinationVariable("roomId") String roomId,
            @Payload Map<String, Object> dto
    ) {
        String userId = String.valueOf(dto.get("userId"));
        String nickname = String.valueOf(dto.getOrDefault("nickname", ""));
        String word = String.valueOf(dto.get("word")).trim();

        WordChainState state = wordChainGameManager.getOrCreate(roomId);
        state.syncPlayers(currentUsers(roomId));

        // ??留먰뭾??(?깃났/?ㅽ뙣 ?곴??놁씠)
        messagingTemplate.convertAndSend(
                "/topic/chat/bubble/" + roomId,
                Map.of(
                        "type", "CHAT_BUBBLE",
                        "userId", userId,
                        "message", word
                )
        );

        // ??怨듯넻 extra 媛앹껜 (?ш린????踰덈쭔 ?좎뼵)
        Map<String, Object> extra = new HashMap<>();
        extra.put("submitUserId", userId);
        extra.put("submitNickname", nickname);
        extra.put("submitWord", word);

        // ??紐⑤떖 3珥??숈븞 ?쒖텧 諛⑹?
        long now = System.currentTimeMillis();
        if (state.isStarted() && now < state.getTurnStartAt()) {
            extra.put("message", "잠시 후 게임이 시작됩니다.");
            broadcastState(roomId, "REJECT", extra);
            return;
        }

        // ???ъ쟾???녿뒗 ?⑥뼱
        if (!wordChainGameManager.existsInDictionary(word)) {
            extra.put("message", "사전에 없는 단어입니다.");
            broadcastState(roomId, "REJECT", extra);
            return;
        }

        // ??洹쒖튃 ?꾨컲
        if (!state.submit(userId, word)) {
            extra.put("message", "규칙에 맞지 않는 단어입니다.");
            broadcastState(roomId, "REJECT", extra);
            return;
        }

        // ???뺣떟 泥섎━
        state.addScore(userId, 10);
        state.decreaseTurnLimit();
        state.onNextTurn();

        extra.put("message", "통과!");
        broadcastState(roomId, "ACCEPT", extra);
    }

    /* =========================
       梨꾪똿
    ========================= */
    @MessageMapping("/wordchain/{roomId}/chat")
    public void chat(
            @DestinationVariable("roomId") String roomId,
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
            @DestinationVariable("roomId") String roomId,
            @Payload Map<String, String> payload
    ) {
        String userId = payload.get("userId");

        WordChainState state = wordChainGameManager.get(roomId);
        // ?앸쭚?뉕린 ?곹깭媛 ?놁쑝硫?寃뚯엫 ?쒖옉 ?꾩씠嫄곕굹 ?대? 醫낅즺) ?ш린?쒕뒗 ??寃??놁쓬
        if (state == null) return;

        // ?⑥? ?좎?(leave??SocketController?먯꽌 ?ㅼ젣濡??쒓굅?? ?ш린?쒕뒗 "?꾩옱 store 湲곗?"?쇰줈 ?먮떒)
        List<Map<String, Object>> remainUsers = lobbyUserStore.getUsers(roomId);

        /* =========================
           耳?댁뒪 A) 寃뚯엫 以?+ 1紐낅쭔 ?⑥쓬 ??寃뚯엫 醫낅즺 + 諛???젣
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
           耳?댁뒪 B) ???좎?媛 ?섍컧 ???쒕뜡 ?좎??먭쾶 ???대룞 + 紐⑤떖 ?대깽??
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

