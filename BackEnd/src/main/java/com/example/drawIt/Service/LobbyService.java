package com.example.drawIt.Service;

import com.example.drawIt.DTO.CreateLobbyDTO;
import com.example.drawIt.DTO.UpdateLobbyDTO;
import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Handler.GlobalExceptionHandler;
import com.example.drawIt.Repository.LobbyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.example.drawIt.Handler.GlobalExceptionHandler.RoomAlreadyExistsException;

import java.util.List;

@Service
@RequiredArgsConstructor
public class LobbyService {

    private final LobbyRepository lobbyRepository;

    /* ============================================================
       방 생성
    ============================================================ */
    @Transactional
    public Lobby createLobby(CreateLobbyDTO dto) {
        if (lobbyRepository.existsByName(dto.getName())) {
            throw new RoomAlreadyExistsException("이미 존재하는 방 ID입니다.");
        }

        Lobby lobby = new Lobby();
        lobby.setId(dto.getId());
        lobby.setName(dto.getName());
        lobby.setMode(dto.getMode());
        lobby.setPassword(dto.getPassword());
        lobby.setHostUserId(dto.getHostUserId());
        lobby.setHostNickname(dto.getHostNickname());
        lobby.setGameStarted(false); // 초기값은 대기중
        lobby.setCreatedAt(java.time.LocalDateTime.now());

        return lobbyRepository.save(lobby);
    }

    /* ============================================================
       방 상세 조회
    ============================================================ */
    @Transactional(readOnly = true)
    public Lobby getLobby(String lobbyId) {
        return lobbyRepository.findById(lobbyId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 방"));
    }

    /* ============================================================
       전체 방 목록 조회
    ============================================================ */
    @Transactional(readOnly = true)
    public List<Lobby> getAllRooms() {
        return lobbyRepository.findAll();
    }

    /* ============================================================
       방 정보 수정 (옵션 변경 등)
    ============================================================ */
    @Transactional
    public Lobby updateLobby(String lobbyId, UpdateLobbyDTO dto) {
        Lobby lobby = lobbyRepository.findById(lobbyId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 방"));

        if (dto.getName() != null) lobby.setName(dto.getName());
        if (dto.getMode() != null) lobby.setMode(dto.getMode());

        // 비밀번호 변경 (빈 값이면 비밀번호 해제)
        lobby.setPassword(dto.getPassword());

        return lobby; // Dirty Checking으로 자동 저장
    }

    /* ============================================================
       🔥 [핵심] 게임 상태 변경 (대기중 <-> 게임중)
       isStarted: true(게임중), false(대기중)
    ============================================================ */
    @Transactional
    public void updateGameStatus(String lobbyId, boolean isStarted) {
        Lobby lobby = lobbyRepository.findById(lobbyId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 방"));

        lobby.setGameStarted(isStarted);
        lobbyRepository.save(lobby); // DB에 확실하게 저장
    }

    @Transactional
    public void markGameStarted(String lobbyId) {
        Lobby lobby = lobbyRepository.findById(lobbyId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 방"));
        lobby.setGameStarted(true);
    }
}