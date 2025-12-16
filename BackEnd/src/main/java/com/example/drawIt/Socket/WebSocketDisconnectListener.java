package com.example.drawIt.Socket;

import com.example.drawIt.Repository.LobbyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Component
@RequiredArgsConstructor
public class WebSocketDisconnectListener {

    private final LobbyUserStore lobbyUserStore;

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        String sessionId =
                StompHeaderAccessor.wrap(event.getMessage()).getSessionId();

        lobbyUserStore.removeSession(sessionId);
    }
}