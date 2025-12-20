package com.example.drawIt.Controller;

import com.example.drawIt.DTO.SocketJoinDTO;
import com.example.drawIt.Domain.DrawEvent;
import com.example.drawIt.Domain.GameState;
import com.example.drawIt.Domain.GameStateManager;
import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Service.LobbyService;
import com.example.drawIt.Socket.LobbyUserStore;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Controller
@RequiredArgsConstructor
public class SocketController {

    private final LobbyUserStore lobbyUserStore;
    private final LobbyService lobbyService;
    private final SimpMessagingTemplate messagingTemplate;
    private final GameStateManager gameStateManager;

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    @MessageMapping("/lobby/{roomId}/join")
    public void join(@DestinationVariable String roomId, @Payload SocketJoinDTO dto, StompHeaderAccessor accessor) {
        String sessionId = Objects.requireNonNull(accessor.getSessionId());
        lobbyUserStore.addUser(roomId, sessionId, dto.getUserId(), dto.getNickname());

        Lobby lobby = lobbyService.getLobby(roomId);
        GameState state = gameStateManager.getGame(roomId);
        boolean gameStarted = (state != null);
        String drawerUserId = (state != null) ? state.getDrawerUserId() : null;
        String currentWord = (state != null) ? state.getCurrentWord() : null;

        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "USER_UPDATE");
        payload.put("users", lobbyUserStore.getUsers(roomId));
        payload.put("hostUserId", lobby.getHostUserId());
        payload.put("gameStarted", gameStarted);
        payload.put("drawerUserId", drawerUserId);
        if(gameStarted && currentWord != null) payload.put("word", currentWord);

        // 중간 입장 시 타이머 동기화
        if (gameStarted) {
            payload.put("roundEndTime", state.getRoundEndTime());
        }

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, payload);

        // 히스토리 전송 로직 (생략 없이 기존과 동일하게 유지)
        if (state != null && !state.getDrawEvents().isEmpty()) {
            Map<String, Object> historyPayload = new HashMap<>();
            List<Map<String, Object>> activeHistory = new ArrayList<>();
            for (DrawEvent evt : state.getDrawEvents()) activeHistory.add(convertEventToMap(evt));
            historyPayload.put("history", activeHistory);
            List<Map<String, Object>> redoHistory = new ArrayList<>();
            for (DrawEvent evt : state.getRedoStack()) redoHistory.add(convertEventToMap(evt));
            historyPayload.put("redoStack", redoHistory);
            messagingTemplate.convertAndSend("/topic/history/" + dto.getUserId(), historyPayload);
        }
    }

    private Map<String, Object> convertEventToMap(DrawEvent evt) {
        Map<String, Object> map = new HashMap<>();
        map.put("type", evt.getType());
        map.put("x", evt.getX());
        map.put("y", evt.getY());
        map.put("color", evt.getColor());
        map.put("width", evt.getLineWidth());
        map.put("userId", evt.getUserId());
        map.put("tool", evt.getTool());
        map.put("points", evt.getPoints());
        return map;
    }

    @MessageMapping("/lobby/{roomId}/start")
    public void startGame(@DestinationVariable String roomId) {
        lobbyService.markGameStarted(roomId);
        var users = lobbyUserStore.getUsers(roomId);
        if (users == null || users.isEmpty()) {
            throw new IllegalStateException("게임 시작 불가: 유저 없음");
        }

        String drawerUserId = gameStateManager.pickRandomDrawer(users);
        GameState state = gameStateManager.createGame(roomId, drawerUserId);
        state.setRoundEndTime(0);

        // ✅ [확인] createGame 안에서 roundEndTime이 설정되므로, 여기서 get 해서 보냄
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "GAME_START",
                "drawerUserId", drawerUserId,
                "word", state.getCurrentWord(),
                "gameStarted", true,
                "roundEndTime", 0L
        ));

        scheduler.schedule(new Runnable() {
            @Override
            public void run() {
                startRealGame(roomId);
            }
        }, 3, TimeUnit.SECONDS);
    }

    @MessageMapping("/lobby/{roomId}/timeover")
    public void timeOver(@DestinationVariable String roomId) {
        processNextRound(roomId);
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;
        var users = lobbyUserStore.getUsers(roomId);
        if (users.isEmpty()) return;

        String newDrawer = gameStateManager.pickRandomDrawer(users);
        state.setDrawerUserId(newDrawer);
        String newWord = gameStateManager.getUniqueWord(state);
        state.setCurrentWord(newWord);

        // ✅ 시간 갱신
        long endTime = System.currentTimeMillis() + 60000;
        state.setRoundEndTime(endTime);

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "DRAWER_CHANGED",
                "drawerUserId", newDrawer,
                "word", newWord,
                "roundEndTime", endTime
        ));
    }

    @MessageMapping("/lobby/{roomId}/leave")
    public void leave(@DestinationVariable String roomId, @Payload Map<String, String> payload) {
        lobbyUserStore.leaveRoom(roomId, payload.get("userId"));
    }

    // (draw, clear, chatBubble 메서드는 기존과 동일하므로 생략하지 않고 그대로 둠)
    @MessageMapping("/draw/{roomId}")
    public void handleDraw(@DestinationVariable String roomId, @Payload DrawEvent evt) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;
        if (!evt.getUserId().equals(state.getDrawerUserId())) return;
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId + "/draw", evt);
        switch (evt.getType()) {
            case "END":
                if (evt.getPoints() != null && !evt.getPoints().isEmpty()) {
                    evt.setType("STROKE");
                    state.getDrawEvents().add(evt);
                    state.getRedoStack().clear();
                }
                break;
            case "FILL": case "CLEAR":
                state.getDrawEvents().add(evt);
                state.getRedoStack().clear();
                break;
            case "UNDO":
                if (!state.getDrawEvents().isEmpty()) state.getRedoStack().push(state.getDrawEvents().remove(state.getDrawEvents().size()-1));
                break;
            case "REDO":
                if (!state.getRedoStack().isEmpty()) state.getDrawEvents().add(state.getRedoStack().pop());
                break;
        }
        if (state.getDrawEvents().size() > 5000) state.getDrawEvents().remove(0);
    }

    @MessageMapping("/draw/{roomId}/clear")
    public void clear(@DestinationVariable String roomId, @Payload Map<String, Object> payload) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;
        Object userIdObj = payload.get("userId");
        if (userIdObj == null || !userIdObj.toString().equals(state.getDrawerUserId())) return;
        DrawEvent clearEvent = new DrawEvent();
        clearEvent.setType("CLEAR");
        clearEvent.setUserId(userIdObj.toString());
        state.getDrawEvents().add(clearEvent);
        state.getRedoStack().clear();
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId + "/draw", Map.of("type", "CLEAR", "userId", userIdObj));
    }

    /* =========================
       채팅 (정답 체크 로직)
    ========================= */
    @MessageMapping("/chat/bubble")
    public void chatBubble(@Payload Map<String, Object> payload) {
        String roomId = (String) payload.get("lobbyId");
        String userId = (String) payload.get("userId");
        String message = (String) payload.get("message");

        // 1. 일반 채팅 전송
        messagingTemplate.convertAndSend(
                "/topic/chat/bubble",
                Map.of("type", "CHAT_BUBBLE", "userId", userId, "message", message)
        );

        // 2. 정답 체크
        GameState state = gameStateManager.getGame(roomId);
        if (state != null && message.trim().equals(state.getCurrentWord())) {

            // 출제자가 본인 답을 말하는 건 무시
            if(userId.equals(state.getDrawerUserId())) return;

            // 정답자의 닉네임 조회
            String winnerNickname = lobbyUserStore.getUsers(roomId).stream()
                    .filter(u -> u.get("userId").equals(userId))
                    .map(u -> (String) u.get("nickname"))
                    .findFirst()
                    .orElse("(알수없음)");

            System.out.println("🎉 정답자 발생! User: " + winnerNickname);

            lobbyUserStore.addScore(roomId, userId, 10);

            if(state.getDrawerUserId() != null) { //출제자가 방에 남아있을 경우
                lobbyUserStore.addScore(roomId, state.getDrawerUserId(), 5);
            }

            messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                    "type", "USER_UPDATE",
                    "users", lobbyUserStore.getUsers(roomId), // 갱신된 점수 포함
                    "gameStarted", true
            ));

            // 1) 모든 유저에게 정답자 알림 (닉네임 포함)
            messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                    "type", "CORRECT_ANSWER",
                    "winnerUserId", userId,
                    "winnerNickname", winnerNickname, // ✅ 닉네임 추가 전송
                    "answer", state.getCurrentWord()
            ));

            // 2) 4초 뒤에 다음 라운드 진행
            scheduler.schedule(() -> {
                processNextRound(roomId);
            }, 4, TimeUnit.SECONDS);
        }
    }

    private void processNextRound(String roomId) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;
        var users = lobbyUserStore.getUsers(roomId);
        if (users.isEmpty()) {
            gameStateManager.removeGame(roomId);
            return;
        }

        // 라운드 증가
        int nextRound = state.getCurrentRound() + 1;

        // 10라운드 종료 체크
        if (nextRound > GameState.MAX_ROUND) {
            messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                    "type", "GAME_OVER"
            ));
            gameStateManager.removeGame(roomId);
            return;
        }
        state.setCurrentRound(nextRound);

        // 새 출제자 선정 (10라운드 규칙 적용)
        String newDrawer = gameStateManager.pickNextDrawer(state, users);
        state.setDrawerUserId(newDrawer);

        // 중복 없는 단어
        String newWord = gameStateManager.getUniqueWord(state);
        state.setCurrentWord(newWord);

        // 새 라운드 시작 시, 이정 그림 히스토리 삭제
        // 이걸 안 하면 데이터가 계속 쌓여서 나중에 렉 걸리고 튕김
        state.getDrawEvents().clear();
        state.getRedoStack().clear();

        state.setRoundEndTime(0);

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "DRAWER_CHANGED",
                "drawerUserId", newDrawer,
                "word", newWord,
                "currentRound", state.getCurrentRound()
        ));

        // 3. 3초 뒤에 "진짜 시작" 신호 예약
        scheduler.schedule(new Runnable() {
            @Override
            public void run() {
                startRealGame(roomId);
            }
        }, 3, TimeUnit.SECONDS);
    }

    private void startRealGame(String roomId) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;

        long duration = 60000;
        long endTime = System.currentTimeMillis() + duration;
        state.setRoundEndTime(endTime);

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "ROUND_START",
                "roundEndTime", endTime
        ));

        // ✅ 현재 라운드 번호를 기억해둠 (예: 1라운드)
        final int currentRound = state.getCurrentRound();

        // 60초 뒤에 실행될 때, 이 라운드 번호를 들고 갑니다.
        scheduler.schedule(() -> {
            checkAndTimeOver(roomId, currentRound);
        }, duration, TimeUnit.MILLISECONDS);
    }

    private void checkAndTimeOver(String roomId, int scheduledRound) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;

        if (state.getCurrentRound() != scheduledRound) {
            return;
        }

        System.out.println("⏰ 시간 초과! (Room: " + roomId + ")");

        // 바로 processNextRound를 호출하지 않고, TIME_OVER 메시지 전송
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "TIME_OVER"
        ));

        // 3초 뒤에 다음 라운드로 넘어가도록 스케줄링
        scheduler.schedule(() -> {
            // 3초 뒤에 실제로 다음 라운드 진행
            // (혹시 그 사이 방이 폭파됐거나 상태 변했을 수 있으니 체크)
            GameState currentState = gameStateManager.getGame(roomId);
            if (currentState != null && currentState.getCurrentRound() == scheduledRound) {
                processNextRound(roomId);
            }
        }, 3, TimeUnit.SECONDS);
    }
}