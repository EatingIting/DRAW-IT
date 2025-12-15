package com.example.drawIt.Service;

import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Handler.GlobalExceptionHandler;
import com.example.drawIt.Repository.LobbyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.*; // util에 있는 모든 서비스

@Service
@RequiredArgsConstructor
public class LobbyService {

    private final LobbyRepository lobbyRepository;

    public Lobby createLobby(String id, String name, String mode, String password, String hostNickname) {
        if (lobbyRepository.existsByName(name)) {
            throw new GlobalExceptionHandler.RoomAlreadyExistsException(
                    "이미 같은 이름의 방이 존재합니다."
            );
        }

        return lobbyRepository.save(new Lobby(id, name, mode, password, hostNickname));
    }

    public Lobby getLobby(String lobbyId) {
        return lobbyRepository.findById(lobbyId)
                .orElseThrow(() ->
                        new GlobalExceptionHandler.LobbyNotFoundException(
                                "존재하지 않는 방입니다."
                        )
                );
    }

    // join service
    // 모든 방 목록을 가지고 오는 메서드
    public List<Lobby> getAllRooms() {
        return lobbyRepository.findAll(); //DB에 모든 데이터 들고오기
    }

}