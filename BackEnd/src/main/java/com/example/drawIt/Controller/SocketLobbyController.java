package com.example.drawIt.Controller;

import com.example.drawIt.DTO.LobbyResponseDTO; // ✅ 이거 import 꼭 확인!
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

    // 방 목록 갱신
    private void broadcastLobbyList() {
        try {
            List<Lobby> lobbies = lobbyService.getAllRooms();
            List<LobbyResponseDTO> dtos = lobbies.stream().map(lobby -> {
                LobbyResponseDTO dto = new LobbyResponseDTO(lobby);
                List<Map<String, Object>> users = lobbyUserStore.getUsers(lobby.getId());
                dto.setCurrentCount((users != null) ? users.size() : 0);
                dto.setMaxCount(10);
                return dto;
            }).collect(Collectors.toList());
            messagingTemplate.convertAndSend("/topic/lobbies", dtos);
        } catch (Exception e) {
            System.err.println("방 목록 갱신 중 오류: " + e.getMessage());
        }
    }

    /* =========================
       입장 / 재접속 (방장 프리패스 적용됨)
    ========================= */
    @MessageMapping("/lobby/{roomId}/join")
    public void join(
            @DestinationVariable String roomId,
            @Payload SocketJoinDTO dto,
            StompHeaderAccessor accessor
    ) {
        try {
            // 1. 방 정보 조회
            Lobby lobby = lobbyService.getLobby(roomId);

            // 2. 비밀번호 검증 (방장은 무조건 통과!)
            // 방 만들 때의 ID(hostUserId)와 지금 들어온 ID(dto.userId)가 같으면 방장임
            boolean isHost = lobby.getHostUserId().equals(dto.getUserId());

            // 방장이 아니고, 비밀번호가 걸려있는데, 틀렸다면? -> 입장 거부
            if (!isHost && lobby.getPassword() != null && !lobby.getPassword().isBlank()) {
                if (dto.getPassword() == null || !dto.getPassword().equals(lobby.getPassword())) {
                    System.out.println("⛔ Socket Join 거부: 비밀번호 불일치 - " + dto.getNickname());
                    return;
                }
            }

            // 3. 유저 저장
            String sessionId = Objects.requireNonNull(accessor.getSessionId());
            lobbyUserStore.addUser(roomId, sessionId, dto.getUserId(), dto.getNickname());

            // 4. 방 상태 조회
            String hostUserId = lobby.getHostUserId();
            GameState state = gameStateManager.getGame(roomId);
            boolean gameStarted = (state != null);
            String drawerUserId = (state != null) ? state.getDrawerUserId() : null;

            // 5. 알림 전송
            Map<String, Object> payload = new HashMap<>();
            payload.put("type", "USER_UPDATE");
            payload.put("users", lobbyUserStore.getUsers(roomId));
            payload.put("hostUserId", hostUserId);
            payload.put("gameStarted", gameStarted);
            payload.put("drawerUserId", drawerUserId);

            messagingTemplate.convertAndSend("/topic/lobby/" + roomId, payload);

            // 6. 히스토리 전송
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
                messagingTemplate.convertAndSend("/topic/history/" + dto.getUserId(), historyPayload);
            }

            // 7. 목록 갱신
            broadcastLobbyList();

        } catch (IllegalArgumentException e) {
            System.err.println("❌ 없는 방 접속 시도 (정상): " + roomId);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // ... (startGame, leave, handleDraw 등 나머지 메서드는 기존 코드 유지) ...
    // 필요하면 아래 startGame, leave 등도 이전 답변에서 복사해서 붙여넣으세요.

    @MessageMapping("/lobby/{roomId}/start")
    public void startGame(@DestinationVariable String roomId) {
        lobbyService.markGameStarted(roomId);
        var users = lobbyUserStore.getUsers(roomId);
        if (users == null || users.isEmpty()) return;
        String drawerUserId = gameStateManager.pickRandomDrawer(users);
        gameStateManager.createGame(roomId, drawerUserId);
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of("type", "GAME_START", "drawerUserId", drawerUserId));
        broadcastLobbyList();
    }

    @MessageMapping("/lobby/{roomId}/leave")
    public void leave(@DestinationVariable String roomId, @Payload Map<String, String> payload) {
        String userId = payload.get("userId");
        lobbyUserStore.leaveRoom(roomId, userId);

        GameState state = gameStateManager.getGame(roomId);
        if (state != null && userId.equals(state.getDrawerUserId())) {
            var users = lobbyUserStore.getUsers(roomId);
            if (users != null && !users.isEmpty()) {
                String newDrawer = gameStateManager.pickRandomDrawer(users);
                state.setDrawerUserId(newDrawer);
                messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of("type", "DRAWER_CHANGED", "drawerUserId", newDrawer));
            }
        }
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of("type", "USER_UPDATE", "users", lobbyUserStore.getUsers(roomId)));
        broadcastLobbyList();
    }

    // handleDraw, clear, sendHistory는 기존 유지
    @MessageMapping("/draw/{roomId}")
    public void handleDraw(@DestinationVariable String roomId, @Payload DrawEvent evt) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null || !evt.getUserId().equals(state.getDrawerUserId())) return;
        if ("CLEAR".equals(evt.getType())) {
            state.getDrawEvents().clear();
            messagingTemplate.convertAndSend("/topic/lobby/" + roomId + "/draw", Map.of("type", "CLEAR"));
            return;
        }
        if (state.getDrawEvents().size() > 10000) state.getDrawEvents().clear();
        state.getDrawEvents().add(evt);
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", evt.getType());
        payload.put("x", evt.getX());
        payload.put("y", evt.getY());
        payload.put("color", evt.getColor());
        payload.put("width", evt.getLineWidth());
        payload.put("tool", evt.getTool());
        payload.put("userId", evt.getUserId());
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId + "/draw", payload);
    }

    @MessageMapping("/draw/{roomId}/clear")
    public void clear(@DestinationVariable String roomId, @Payload Map<String, Object> payload) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;
        if (!payload.get("userId").toString().equals(state.getDrawerUserId())) return;
        state.getDrawEvents().clear();
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId + "/draw", Map.of("type", "CLEAR"));
    }

    @MessageMapping("/draw/{roomId}/history")
    public void sendHistory(@DestinationVariable String roomId, StompHeaderAccessor accessor) {
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
        messagingTemplate.convertAndSendToUser(sessionId, "/queue/draw/history", historyPayload);
    }
}