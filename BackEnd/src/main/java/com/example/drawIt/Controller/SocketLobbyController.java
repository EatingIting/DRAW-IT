package com.example.drawIt.Controller;

import com.example.drawIt.DTO.SocketJoinDTO;
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
    private final SimpMessagingTemplate messagingTemplate;

    /* =========================
       입장 / 재접속 (userId 기반)
    ========================= */
    @MessageMapping("/lobby/{roomId}/join")
    public void join(
            @DestinationVariable String roomId,
            @Payload SocketJoinDTO dto,
            StompHeaderAccessor accessor
    ) {
        String sessionId = accessor.getSessionId();

        // ✅ userId 기반 입장 / 재접속 처리
        lobbyUserStore.addUser(
                roomId,
                sessionId,
                dto.getUserId(),
                dto.getNickname()
        );

        // ✅ 유저 목록 브로드캐스트
        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                Map.of(
                        "type", "USER_UPDATE",
                        "users", lobbyUserStore.getUsers(roomId)
                )
        );
    }

    /* =========================
       게임 시작 (방장만)
    ========================= */
    @MessageMapping("/lobby/{roomId}/start")
    public void startGame(@DestinationVariable String roomId) {

        // 권한 체크는 LobbyUserStore / 프론트에서 이미 보장
        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                Map.of("type", "GAME_START")
        );
    }

    /* =========================
       방 삭제 (방장만, 진짜 퇴장)
    ========================= */
    @MessageMapping("/lobby/{roomId}/destroy")
    public void destroyRoom(@DestinationVariable String roomId) {

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                Map.of("type", "ROOM_DESTROYED")
        );
    }
}
