package com.example.drawIt.Socket;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class LobbyCleanupScheduler {

    private final LobbyUserStore lobbyUserStore;

    @Scheduled(fixedDelay = 1000) // 1초마다 유령방 정리
    public void cleanupDisconnectedUsers() {
        lobbyUserStore.cleanup();
    }
}
