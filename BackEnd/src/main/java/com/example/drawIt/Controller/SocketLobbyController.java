package com.example.drawIt.Controller;

import com.example.drawIt.DTO.LobbyResponseDTO;
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
import java.util.stream.Collectors;

@Controller
@RequiredArgsConstructor
public class SocketLobbyController {

    private final LobbyUserStore lobbyUserStore;
    private final LobbyService lobbyService;
    private final SimpMessagingTemplate messagingTemplate;
    private final GameStateManager gameStateManager;

    /* =========================
       [수정됨] 방 목록 전체 브로드캐스트
    ========================= */
    private void broadcastLobbyList() {
        List<Lobby> lobbies = lobbyService.getAllRooms();

        List<LobbyResponseDTO> dtos = lobbies.stream().map(lobby -> {
            LobbyResponseDTO dto = new LobbyResponseDTO(lobby);

            // 🔥 [여기가 오류 수정된 부분] Set -> List<Map...>
            List<Map<String, Object>> users = lobbyUserStore.getUsers(lobby.getId());
            int currentCount = (users != null) ? users.size() : 0;

            dto.setCurrentCount(currentCount);
            dto.setMaxCount(10);
            return dto;
        }).collect(Collectors.toList());

        messagingTemplate.convertAndSend("/topic/lobbies", dtos);
    }

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

        if (state != null && !state.getDrawEvents().isEmpty()) {
            List<Map<String, Object>> historyPayload = new ArrayList<>();
            for (DrawEvent evt : state.getDrawEvents()) {
                Map<String, Object> map = new HashMap<>();
                map.put("type", evt.getType());
                map.put("x", evt.getX());
                map.put("y", evt.getY());
                map.put("color", evt.getColor());
                map.put("width", evt.getLineWidth());
                map.put("userId", evt.getUserId());
                map.put("tool", evt.getTool());
                historyPayload.add(map);
            }
            messagingTemplate.convertAndSend(
                    "/topic/history/" + dto.getUserId(),
                    historyPayload
            );
        }

        // 입장했으니 목록 갱신
        broadcastLobbyList();
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

        // 상태 변경 알림
        broadcastLobbyList();
    }

    /* =========================
       나가기
    ========================= */
    @MessageMapping("/lobby/{roomId}/leave")
    public void leave(
            @DestinationVariable String roomId,
            @Payload Map<String, String> payload
    ) {
        String userId = payload.get("userId");

        lobbyUserStore.leaveRoom(roomId, userId);

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

        // 퇴장했으니 목록 갱신
        broadcastLobbyList();
    }

    /* =========================
       그림 그리기 (변경 없음)
    ========================= */
    @MessageMapping("/draw/{roomId}")
    public void handleDraw(
            @DestinationVariable String roomId,
            @Payload DrawEvent evt
    ) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;
        if (!evt.getUserId().equals(state.getDrawerUserId())) return;

        if ("CLEAR".equals(evt.getType())) {
            state.getDrawEvents().clear();
            messagingTemplate.convertAndSend(
                    "/topic/lobby/" + roomId + "/draw",
                    Map.of("type", "CLEAR")
            );
            return;
        }

        if (state.getDrawEvents().size() > 10_000) {
            state.getDrawEvents().clear();
        }
        state.getDrawEvents().add(evt);

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