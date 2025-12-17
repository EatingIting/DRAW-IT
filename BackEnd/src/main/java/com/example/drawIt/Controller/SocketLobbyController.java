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

        String sessionId = Objects.requireNonNull(
                accessor.getSessionId(),
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

            List<Map<String, Object>> historyPayload = new ArrayList<>();

            for (DrawEvent evt : state.getDrawEvents()) {
                Map<String, Object> map = new HashMap<>();
                map.put("type", evt.getType());
                map.put("x", evt.getX());
                map.put("y", evt.getY());
                map.put("color", evt.getColor());
                map.put("width", evt.getLineWidth()); // 지난번 답변의 굵기 이슈도 여기서 챙김
                map.put("userId", evt.getUserId());
                map.put("tool", evt.getTool()); // tool 정보도 포함하면 좋음

                historyPayload.add(map);
            }

            // 변경된 전송 방식: 유저 ID 기반의 고유 토픽 사용
            messagingTemplate.convertAndSend(
                    "/topic/history/" + dto.getUserId(),
                    historyPayload
            );
        }
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

        // drawer 검증
        if (!evt.getUserId().equals(state.getDrawerUserId())) return;

        // CLEAR 처리
        if ("CLEAR".equals(evt.getType())) {
            state.getDrawEvents().clear();

            messagingTemplate.convertAndSend(
                    "/topic/lobby/" + roomId + "/draw",
                    Map.of("type", "CLEAR")
            );
            return;
        }

        // 히스토리 제한
        if (state.getDrawEvents().size() > 10_000) {
            state.getDrawEvents().clear();
        }

        // 히스토리 저장 (DrawEvent)
        state.getDrawEvents().add(evt);

        // ✅ 프론트 호환 Map으로 변환해서 브로드캐스트
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", evt.getType());
        payload.put("x", evt.getX());
        payload.put("y", evt.getY());
        payload.put("color", evt.getColor());
        payload.put("width", evt.getLineWidth());
        payload.put("tool", evt.getTool());
        payload.put("userId", evt.getUserId());

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId + "/draw",
                payload
        );
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
        if (userIdObj == null) return;

        if (!userIdObj.toString().equals(state.getDrawerUserId())) return;

        state.getDrawEvents().clear();

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId + "/draw",
                Map.of("type", "CLEAR")
        );
    }

    @MessageMapping("/draw/{roomId}/history")
    public void sendHistory(
            @DestinationVariable String roomId,
            StompHeaderAccessor accessor) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null || state.getDrawEvents().isEmpty()) return;

        String sessionId = Objects.requireNonNull(accessor.getSessionId());

        List<Map<String, Object>> historyPayload = new ArrayList<>();
        for (DrawEvent evt : state.getDrawEvents()) {
            Map<String, Object> map = new HashMap<>();
            map.put("type", evt.getType());
            map.put("x", evt.getX());
            map.put("y", evt.getY());
            map.put("color", evt.getColor());
            map.put("width", evt.getLineWidth());
            map.put("userId", evt.getUserId());
            historyPayload.add(map);
        }

        messagingTemplate.convertAndSendToUser(
                sessionId,
                "/queue/draw/history",
                historyPayload
        );
    }
}
