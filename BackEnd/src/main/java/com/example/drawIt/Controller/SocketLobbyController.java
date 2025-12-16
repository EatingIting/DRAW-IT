package com.example.drawIt.Controller;

import com.example.drawIt.DTO.SocketJoinDTO;
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

import java.util.Map;

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
        lobbyUserStore.addUser(
                roomId,
                accessor.getSessionId(),
                dto.getUserId(),
                dto.getNickname()
        );

        Lobby lobby = lobbyService.getLobby(roomId);
        String hostUserId = lobby.getHostUserId();

        GameState state = gameStateManager.getGame(roomId);
        boolean gameStarted = (state != null);
        String drawerUserId = (state != null) ? state.getDrawerUserId() : null;

        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("type", "USER_UPDATE");
        payload.put("users", lobbyUserStore.getUsers(roomId));
        payload.put("hostUserId", hostUserId);      // null 가능
        payload.put("gameStarted", gameStarted);    // false 가능
        payload.put("drawerUserId", drawerUserId);  // null 가능

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                payload
        );

        if (state != null && !state.getDrawEvents().isEmpty()) {
            messagingTemplate.convertAndSendToUser(
                    accessor.getSessionId(),
                    "/queue/draw/history",
                    state.getDrawEvents()
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
    @MessageMapping("/draw/{roomId}")
    public void draw(
            @DestinationVariable String roomId,
            @Payload Map<String, Object> payload
    ) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;

        Object userIdObj = payload.get("userId");
        if (userIdObj == null) return;

        String userId = userIdObj.toString();
        if (!userId.equals(state.getDrawerUserId())) return;

        // 🔹 히스토리 제한
        if (state.getDrawEvents().size() > 10_000) {
            state.getDrawEvents().clear();
        }

        state.getDrawEvents().add(payload);

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
}
