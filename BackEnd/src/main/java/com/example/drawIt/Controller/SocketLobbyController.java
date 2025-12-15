package com.example.drawIt.Controller;

import com.example.drawIt.DTO.SocketJoinDTO;
import com.example.drawIt.Socket.LobbyUserStore;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Controller;
import java.util.Map;

@Controller
@RequiredArgsConstructor
public class SocketLobbyController {

    private final LobbyUserStore lobbyUserStore;
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/lobby/{roomId}/join")
    public void joinLobby(
            @DestinationVariable String roomId,
            SocketJoinDTO dto,
            StompHeaderAccessor accessor
    ) {
        String sessionId = accessor.getSessionId();

        lobbyUserStore.addUser(roomId, sessionId, dto.getNickname());

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                Map.of(
                        "type", "USER_UPDATE",
                        "users", lobbyUserStore.getUsers(roomId)
                )
        );
    }
}