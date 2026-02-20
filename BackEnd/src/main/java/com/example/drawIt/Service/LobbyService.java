package com.example.drawIt.Service;

import com.example.drawIt.DTO.CreateLobbyDTO;
import com.example.drawIt.DTO.UpdateLobbyDTO;
import com.example.drawIt.Domain.GameMode;
import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Handler.GlobalExceptionHandler.RoomAlreadyExistsException;
import com.example.drawIt.Repository.LobbyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class LobbyService {

    private final LobbyRepository lobbyRepository;

    @Transactional
    public Lobby createLobby(CreateLobbyDTO dto) {
        if (lobbyRepository.existsByName(dto.getName())) {
            throw new RoomAlreadyExistsException("Room name already exists.");
        }

        Lobby lobby = new Lobby();
        lobby.setId(dto.getId());
        lobby.setName(dto.getName());
        lobby.setMode(normalizeMode(dto.getMode()));
        lobby.setPassword(dto.getPassword());
        lobby.setHostUserId(dto.getHostUserId());
        lobby.setHostNickname(dto.getHostNickname());
        lobby.setGameStarted(false);
        lobby.setCreatedAt(LocalDateTime.now());

        return lobbyRepository.save(lobby);
    }

    @Transactional(readOnly = true)
    public Lobby getLobby(String lobbyId) {
        return lobbyRepository.findById(lobbyId)
                .orElseThrow(() -> new IllegalArgumentException("Lobby not found."));
    }

    @Transactional(readOnly = true)
    public List<Lobby> getAllRooms() {
        return lobbyRepository.findAll();
    }

    @Transactional
    public Lobby updateLobby(String lobbyId, UpdateLobbyDTO dto) {
        Lobby lobby = lobbyRepository.findById(lobbyId)
                .orElseThrow(() -> new IllegalArgumentException("Lobby not found."));

        if (dto.getName() != null) {
            lobby.setName(dto.getName());
        }
        if (dto.getMode() != null) {
            lobby.setMode(normalizeMode(dto.getMode()));
        }

        lobby.setPassword(dto.getPassword());
        return lobby;
    }

    @Transactional
    public void updateGameStatus(String lobbyId, boolean isStarted) {
        Lobby lobby = lobbyRepository.findById(lobbyId)
                .orElseThrow(() -> new IllegalArgumentException("Lobby not found."));

        lobby.setGameStarted(isStarted);
        lobbyRepository.save(lobby);
    }

    @Transactional
    public void markGameStarted(String lobbyId) {
        Lobby lobby = lobbyRepository.findById(lobbyId)
                .orElseThrow(() -> new IllegalArgumentException("Lobby not found."));
        lobby.setGameStarted(true);
    }

    private String normalizeMode(String rawMode) {
        if (rawMode == null || rawMode.isBlank()) {
            return GameMode.RANDOM.name();
        }

        String source = rawMode.trim();
        String mode = source.toUpperCase();

        if ("WORDCHAIN".equals(mode) || "끝말잇기".equals(source)) {
            mode = GameMode.WORD_CHAIN.name();
        }

        try {
            return GameMode.valueOf(mode).name();
        } catch (IllegalArgumentException ex) {
            return GameMode.RANDOM.name();
        }
    }
}
