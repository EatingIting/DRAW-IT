package com.example.drawIt.Service;

import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Repository.LobbyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import static Handler.GlobalExceptionHandler.*;


@Service
@RequiredArgsConstructor
public class LobbyService {

    private final LobbyRepository lobbyRepository;

    public Lobby createLobby(String name, String mode) {
        if (lobbyRepository.existsByName(name)) {
            throw new RoomAlreadyExistsException("이미 같은 이름의 방이 존재합니다.");
        }

        return lobbyRepository.save(new Lobby(name, mode));
    }

    public Lobby getLobby(Long lobbyId) {
        return lobbyRepository.findById(lobbyId)
                .orElseThrow(() ->
                        new LobbyNotFoundException("존재하지 않는 방입니다.")
                );
    }
}