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
import java.util.concurrent.ConcurrentHashMap;

@Controller
@RequiredArgsConstructor
public class SocketLobbyController {

    private final LobbyUserStore lobbyUserStore;
    private final LobbyService lobbyService;
    private final SimpMessagingTemplate messagingTemplate;
    private final GameStateManager gameStateManager;

    /* =========================
       입장 / 재접속
    ========================= */
    @MessageMapping("/lobby/{roomId}/join")
    public void join(
            @DestinationVariable String roomId,
            @Payload SocketJoinDTO dto,
            StompHeaderAccessor accessor
    ) {

        String sessionId = Objects.requireNonNull(accessor.getSessionId(),
                "STOMP sessionId is null"
        );

        lobbyUserStore.addUser(
                roomId,
                sessionId,
                dto.getUserId(),
                dto.getNickname()
        );

        Lobby lobby = lobbyService.getLobby(roomId);
        String hostUserId = lobby.getHostUserId();

        GameState state = gameStateManager.getGame(roomId);
        boolean gameStarted = (state != null);
        String drawerUserId = (state != null) ? state.getDrawerUserId() : null;

        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "USER_UPDATE");
        payload.put("users", lobbyUserStore.getUsers(roomId));
        payload.put("hostUserId", hostUserId);
        payload.put("gameStarted", gameStarted);
        payload.put("drawerUserId", drawerUserId);

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                payload
        );

        // ✅ 중간 입장 히스토리 전송 (완전한 정답)
        if (state != null && !state.getDrawEvents().isEmpty()) {

            Map<String, Object> totalHistoryPayload = new HashMap<>();

            // 1. 현재 그려진 히스토리 (Active History)
            List<Map<String, Object>> activeHistory = new ArrayList<>();
            for (DrawEvent evt : state.getDrawEvents()) {
                activeHistory.add(convertEventToMap(evt)); // 아래 헬퍼 메소드 참고
            }
            totalHistoryPayload.put("history", activeHistory);

            // 2. 취소된 히스토리 (Redo Stack)
            // ★ 이것을 보내줘야 들어오자마자 Redo가 가능합니다.
            List<Map<String, Object>> redoHistory = new ArrayList<>();
            for (DrawEvent evt : state.getRedoStack()) {
                redoHistory.add(convertEventToMap(evt));
            }
            totalHistoryPayload.put("redoStack", redoHistory);

            // 변경된 전송 방식: Map을 전송 (history + redoStack)
            messagingTemplate.convertAndSend(
                    "/topic/history/" + dto.getUserId(),
                    totalHistoryPayload
            );
        }
    }

    // (편의를 위한 헬퍼 메서드 - 같은 클래스 하단에 추가)
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

    /* =========================
       게임 시작
    ========================= */
    @MessageMapping("/lobby/{roomId}/start")
    public void startGame(@DestinationVariable String roomId) {

        lobbyService.markGameStarted(roomId);

        var users = lobbyUserStore.getUsers(roomId);
        if (users == null || users.isEmpty()) {
            throw new IllegalStateException("게임 시작 불가: 유저 없음");
        }

        String drawerUserId = gameStateManager.pickRandomDrawer(users);
        gameStateManager.createGame(roomId, drawerUserId);

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                Map.of(
                        "type", "GAME_START",
                        "drawerUserId", drawerUserId
                )
        );
    }

    /* =========================
       나가기 (drawer 이탈 처리 포함)
    ========================= */
    @MessageMapping("/lobby/{roomId}/leave")
    public void leave(
            @DestinationVariable String roomId,
            @Payload Map<String, String> payload
    ) {
        String userId = payload.get("userId");

        lobbyUserStore.leaveRoom(roomId, userId);

        // 🔹 drawer가 나간 경우 재선정
        GameState state = gameStateManager.getGame(roomId);
        if (state != null && userId.equals(state.getDrawerUserId())) {

            var users = lobbyUserStore.getUsers(roomId);
            if (users != null && !users.isEmpty()) {
                String newDrawer = gameStateManager.pickRandomDrawer(users);
                state.setDrawerUserId(newDrawer);

                messagingTemplate.convertAndSend(
                        "/topic/lobby/" + roomId,
                        Map.of(
                                "type", "DRAWER_CHANGED",
                                "drawerUserId", newDrawer
                        )
                );
            }
        }

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                Map.of(
                        "type", "USER_UPDATE",
                        "users", lobbyUserStore.getUsers(roomId)
                )
        );
    }

    /* =========================
       그림 그리기
    ========================= */
    /* =========================
   그림 그리기 (단일 메서드)
========================= */
    @MessageMapping("/draw/{roomId}")
    public void handleDraw(
            @DestinationVariable String roomId,
            @Payload DrawEvent evt
    ) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;
        if (!evt.getUserId().equals(state.getDrawerUserId())) return;

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId + "/draw", evt);

        switch (evt.getType()) {
            case "START":
            case "MOVE":
                break;

            case "END":
                // ★★★ 핵심 수정 1: 타입을 'STROKE'로 강제 변경하여 저장 ★★★
                // 이렇게 해야 나중에 들어온 사람이 redrawAll 할 때 선으로 인식합니다.
                if (evt.getPoints() != null && !evt.getPoints().isEmpty()) {
                    evt.setType("STROKE");
                    state.getDrawEvents().add(evt);
                    state.getRedoStack().clear();
                }
                break;

            case "FILL":
            case "CLEAR":
                state.getDrawEvents().add(evt);
                state.getRedoStack().clear();
                break;

            // ... (UNDO, REDO 로직은 기존과 동일) ...
            case "UNDO":
                List<DrawEvent> history = state.getDrawEvents();
                if (!history.isEmpty()) {
                    DrawEvent lastAction = history.remove(history.size() - 1);
                    state.getRedoStack().push(lastAction);
                }
                break;

            case "REDO":
                Stack<DrawEvent> redoStack = state.getRedoStack();
                if (!redoStack.isEmpty()) {
                    DrawEvent action = redoStack.pop();
                    state.getDrawEvents().add(action);
                }
                break;
        }

        if (state.getDrawEvents().size() > 5000) {
            state.getDrawEvents().remove(0);
        }
    }

    /* =========================
       전체 지우기
    ========================= */
    @MessageMapping("/draw/{roomId}/clear")
    public void clear(
            @DestinationVariable String roomId,
            @Payload Map<String, Object> payload
    ) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;

        Object userIdObj = payload.get("userId");
        if (userIdObj == null || !userIdObj.toString().equals(state.getDrawerUserId())) return;

        // "전체 지우기" 라는 동작을 히스토리에 추가 (그래야 Undo 가능)
        DrawEvent clearEvent = new DrawEvent();
        clearEvent.setType("CLEAR");
        clearEvent.setUserId(userIdObj.toString());

        state.getDrawEvents().add(clearEvent);
        state.getRedoStack().clear();

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId + "/draw",
                Map.of("type", "CLEAR", "userId", userIdObj)
        );
    }
}
