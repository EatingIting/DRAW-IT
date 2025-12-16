package com.example.drawIt.Service;

import com.example.drawIt.DTO.UpdateLobbyDTO;
import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Repository.LobbyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class LobbyService {

    private final LobbyRepository lobbyRepository;

    @Transactional
    public Lobby createLobby(String id, String name, String mode, String password,
                             String hostUserId, String hostNickname) {

        if (lobbyRepository.existsById(id)) {
            throw new IllegalArgumentException("이미 존재하는 방");
        }

        Lobby lobby = new Lobby();
        lobby.setId(id);
        lobby.setName(name);
        lobby.setMode(mode);
        lobby.setPassword(password);
        lobby.setHostUserId(hostUserId);
        lobby.setHostNickname(hostNickname);

        return lobbyRepository.save(lobby);
    }

    @Transactional(readOnly = true)
    public Lobby getLobby(String lobbyId) {
        return lobbyRepository.findById(lobbyId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 방"));
    }

    @Transactional(readOnly = true)
    public List<Lobby> getAllRooms() {
        return lobbyRepository.findAll();
    }

    @Transactional
    public Lobby updateLobby(String lobbyId, UpdateLobbyDTO dto) {
        Lobby lobby = lobbyRepository.findById(lobbyId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 방"));

        // null/빈값 방어 (원하시면 더 엄격하게 검증 가능)
        if (dto.getName() != null) lobby.setName(dto.getName());
        if (dto.getMode() != null) lobby.setMode(dto.getMode());

        // password는 "비번 끄면 null"로 내려오는 걸 그대로 반영
        lobby.setPassword(dto.getPassword());

        return lobby; // @Transactional이라 dirty checking으로 자동 update
    }
}
