package com.example.drawIt.Controller;

import com.example.drawIt.DTO.CreateLobbyDTO;
import com.example.drawIt.DTO.LobbyResponseDTO;
import com.example.drawIt.DTO.UpdateLobbyDTO;
import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Service.LobbyService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class LobbyController {

    private final LobbyService lobbyService;
    private final SimpMessagingTemplate messagingTemplate;

    @PostMapping("/lobby")
    public ResponseEntity<LobbyResponseDTO> createLobby(
            @RequestBody CreateLobbyDTO dto
    ) {
        // 필수값 방어 (선택 사항이지만 권장)
        if (dto.getId() == null || dto.getId().isBlank()) {
            throw new IllegalArgumentException("방 ID는 필수입니다.");
        }
        if (dto.getName() == null || dto.getName().isBlank()) {
            throw new IllegalArgumentException("방 이름은 필수입니다.");
        }
        if (dto.getMode() == null || dto.getMode().isBlank()) {
            throw new IllegalArgumentException("게임 모드는 필수입니다.");
        }
        if (dto.getHostUserId() == null || dto.getHostUserId().isBlank()) {
            throw new IllegalArgumentException("방장 ID는 필수입니다.");
        }
        if (dto.getHostNickname() == null || dto.getHostNickname().isBlank()) {
            throw new IllegalArgumentException("방장 닉네임은 필수입니다.");
        }

        // ✅ DTO 그대로 넘긴다 (핵심)
        Lobby lobby = lobbyService.createLobby(dto);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(new LobbyResponseDTO(lobby));
    }

    @GetMapping("/lobby/{lobbyId}")
    public ResponseEntity<LobbyResponseDTO> getLobby(@PathVariable String lobbyId) {
        Lobby lobby = lobbyService.getLobby(lobbyId);
        return ResponseEntity.ok(new LobbyResponseDTO(lobby));
    }

    @GetMapping("/api/lobbies")
    public List<LobbyResponseDTO> getLobbyList() {
        return lobbyService.getAllRooms()
                .stream()
                .map(lobby -> {
                    System.out.println(
                            "DB gameStarted = " + lobby.isGameStarted()
                    );
                    return new LobbyResponseDTO(lobby);
                })
                .toList();
    }

    @PutMapping("/lobby/{lobbyId}")
    public ResponseEntity<LobbyResponseDTO> updateLobby(
            @PathVariable String lobbyId,
            @RequestBody UpdateLobbyDTO dto
    ) {
        Lobby updated = lobbyService.updateLobby(lobbyId, dto);

        // 로비에 즉시 반영
        messagingTemplate.convertAndSend(
                "/topic/lobby/" + lobbyId,
                Map.of(
                        "type", "ROOM_UPDATED",
                        "roomId", updated.getId(),
                        "roomName", updated.getName(),
                        "mode", updated.getMode(),
                        "passwordEnabled", updated.getPassword() != null && !updated.getPassword().isBlank()
                )
        );

        return ResponseEntity.ok(new LobbyResponseDTO(updated));
    }
}
