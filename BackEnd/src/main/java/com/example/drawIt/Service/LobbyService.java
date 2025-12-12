package com.example.drawIt.Service;

import com.example.drawIt.DTO.CreateLobbyRequest;
import com.example.drawIt.domain.Lobby;
import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicLong;

@Service
public class LobbyService {
    private final AtomicLong idGenerator = new AtomicLong(1);

    public Lobby createLobby(CreateLobbyRequest request) {
        Long lobbyId = idGenerator.getAndIncrement();

        return new Lobby(
                lobbyId,
                request.getLobbyName(),
                request.getMode(),
                request.getPassword()
        );
    }
}
