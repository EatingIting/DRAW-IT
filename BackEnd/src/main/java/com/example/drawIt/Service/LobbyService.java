package com.example.drawIt.Service;

import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Handler.GlobalExceptionHandler;
import com.example.drawIt.Repository.LobbyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class LobbyService {

    private final LobbyRepository lobbyRepository;

    public Lobby createLobby(String id, String name, String mode, String password) {
        if (lobbyRepository.existsByName(name)) {
            throw new GlobalExceptionHandler.RoomAlreadyExistsException(
                    "이미 같은 이름의 방이 존재합니다."
            );
        }

        return lobbyRepository.save(new Lobby(id, name, mode, password));
    }

    public Lobby getLobby(String lobbyId) {
        return lobbyRepository.findById(lobbyId)
                .orElseThrow(() ->
                        new GlobalExceptionHandler.LobbyNotFoundException(
                                "존재하지 않는 방입니다."
                        )
                );
    }
}