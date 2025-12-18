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

@Controller
@RequiredArgsConstructor
public class SocketController {

    private final LobbyUserStore lobbyUserStore;
    private final LobbyService lobbyService;
    private final SimpMessagingTemplate messagingTemplate;
    private final GameStateManager gameStateManager;

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

        // ✅ [추가] 중간 입장 시 타이머 동기화
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

        // ✅ [확인] createGame 안에서 roundEndTime이 설정되므로, 여기서 get 해서 보냄
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "GAME_START",
                "drawerUserId", drawerUserId,
                "word", state.getCurrentWord(),
                "roundEndTime", state.getRoundEndTime() // ✅ 시간 전송
        ));
    }

    @MessageMapping("/lobby/{roomId}/timeover")
    public void timeOver(@DestinationVariable String roomId) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;
        var users = lobbyUserStore.getUsers(roomId);
        if (users.isEmpty()) return;

        String newDrawer = gameStateManager.pickRandomDrawer(users);
        state.setDrawerUserId(newDrawer);
        String newWord = gameStateManager.pickRandomWord();
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

    @MessageMapping("/chat/bubble")
    public void chatBubble(@Payload Map<String, Object> payload) {
        messagingTemplate.convertAndSend("/topic/chat/bubble", Map.of("type", "CHAT_BUBBLE", "userId", payload.get("userId"), "message", payload.get("message")));
    }
}