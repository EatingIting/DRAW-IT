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
    public ResponseEntity<LobbyResponseDTO> createLobby(@RequestBody CreateLobbyDTO dto) {
        Lobby lobby = lobbyService.createLobby(
                dto.getId(),
                dto.getName(),
                dto.getMode(),
                dto.getPassword(),
                dto.getHostUserId(),
                dto.getHostNickname()
        );

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
    public List<Lobby> getLobbyList() {
        return lobbyService.getAllRooms();
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
