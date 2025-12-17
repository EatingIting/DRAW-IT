package com.example.drawIt.Controller;

import com.example.drawIt.DTO.CreateLobbyDTO;
import com.example.drawIt.DTO.LobbyResponseDTO;
import com.example.drawIt.DTO.UpdateLobbyDTO;
import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Service.LobbyService;
import com.example.drawIt.Socket.LobbyUserStore;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class LobbyController {

    private final LobbyService lobbyService;
    private final SimpMessagingTemplate messagingTemplate;
    private final LobbyUserStore lobbyUserStore;

    /* =========================
       [수정됨] 방 목록 전체 브로드캐스트
    ========================= */
    private void broadcastLobbyList() {
        List<Lobby> lobbies = lobbyService.getAllRooms();

        List<LobbyResponseDTO> dtos = lobbies.stream().map(lobby -> {
            LobbyResponseDTO dto = new LobbyResponseDTO(lobby);

            // 🔥 [여기가 오류 수정된 부분] Set -> List<Map...>
            List<Map<String, Object>> users = lobbyUserStore.getUsers(lobby.getId());
            int currentCount = (users != null) ? users.size() : 0;

            dto.setCurrentCount(currentCount);
            dto.setMaxCount(10);
            return dto;
        }).collect(Collectors.toList());

        messagingTemplate.convertAndSend("/topic/lobbies", dtos);
    }

    @PostMapping("/lobby")
    public ResponseEntity<LobbyResponseDTO> createLobby(
            @RequestBody CreateLobbyDTO dto
    ) {
        if (dto.getId() == null || dto.getId().isBlank()) throw new IllegalArgumentException("방 ID 필수");
        if (dto.getName() == null || dto.getName().isBlank()) throw new IllegalArgumentException("방 이름 필수");
        if (dto.getMode() == null || dto.getMode().isBlank()) throw new IllegalArgumentException("모드 필수");
        if (dto.getHostUserId() == null || dto.getHostUserId().isBlank()) throw new IllegalArgumentException("방장 ID 필수");
        if (dto.getHostNickname() == null || dto.getHostNickname().isBlank()) throw new IllegalArgumentException("방장 닉네임 필수");

        Lobby lobby = lobbyService.createLobby(dto);

        // 방 생성 직후 목록 갱신
        broadcastLobbyList();

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(new LobbyResponseDTO(lobby));
    }

    @GetMapping("/lobby/{lobbyId}")
    public ResponseEntity<LobbyResponseDTO> getLobby(@PathVariable String lobbyId) {
        Lobby lobby = lobbyService.getLobby(lobbyId);
        LobbyResponseDTO dto = new LobbyResponseDTO(lobby);

        // 🔥 [여기도 수정]
        List<Map<String, Object>> users = lobbyUserStore.getUsers(lobbyId);
        dto.setCurrentCount((users != null) ? users.size() : 0);
        dto.setMaxCount(10);

        return ResponseEntity.ok(dto);
    }

    @GetMapping("/api/lobbies")
    public List<LobbyResponseDTO> getLobbyList() {
        return lobbyService.getAllRooms()
                .stream()
                .map(lobby -> {
                    LobbyResponseDTO dto = new LobbyResponseDTO(lobby);

                    // 🔥 [여기도 수정]
                    List<Map<String, Object>> users = lobbyUserStore.getUsers(lobby.getId());
                    int currentCount = (users != null) ? users.size() : 0;

                    dto.setCurrentCount(currentCount);
                    dto.setMaxCount(10);
                    return dto;
                })
                .collect(Collectors.toList());
    }

    @PutMapping("/lobby/{lobbyId}")
    public ResponseEntity<LobbyResponseDTO> updateLobby(
            @PathVariable String lobbyId,
            @RequestBody UpdateLobbyDTO dto
    ) {
        Lobby updated = lobbyService.updateLobby(lobbyId, dto);

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

        broadcastLobbyList();

        return ResponseEntity.ok(new LobbyResponseDTO(updated));
    }
}