package com.example.drawIt.Controller;

import com.example.drawIt.DTO.SocketJoinDTO;
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

    /* =========================
       입장 / 재접속
    ========================= */
    @MessageMapping("/lobby/{roomId}/join")
    public void join(
            @DestinationVariable String roomId,
            @Payload SocketJoinDTO dto,
            StompHeaderAccessor accessor
    ) {
        String sessionId = accessor.getSessionId();

        lobbyUserStore.addUser(
                roomId,
                sessionId,
                dto.getUserId(),
                dto.getNickname()
        );

        Lobby lobby = lobbyService.getLobby(roomId);

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                Map.of(
                        "type", "USER_UPDATE",
                        "roomId", lobby.getId(),
                        "roomName", lobby.getName(),
                        "users", lobbyUserStore.getUsers(roomId)
                )
        );
        System.out.println("🔥 JOIN RECEIVED");
    }

    /* =========================
       게임 시작
    ========================= */
    @MessageMapping("/lobby/{roomId}/start")
    public void startGame(@DestinationVariable String roomId) {

        lobbyService.markGameStarted(roomId);

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                Map.of("type", "GAME_START")
        );
    }

    /* =========================
       방 삭제
    ========================= */
    @MessageMapping("/lobby/{roomId}/destroy")
    public void destroyRoom(@DestinationVariable String roomId) {
        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                Map.of("type", "ROOM_DESTROYED")
        );
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

        Lobby lobby = lobbyService.getLobby(roomId);

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                Map.of(
                        "type", "USER_UPDATE",
                        "roomId", lobby.getId(),
                        "roomName", lobby.getName(),
                        "users", lobbyUserStore.getUsers(roomId)
                )
        );
    }
}
