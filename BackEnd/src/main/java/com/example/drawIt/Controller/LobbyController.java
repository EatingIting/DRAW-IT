package com.example.drawIt.Controller;

import com.example.drawIt.DTO.CreateLobbyDTO;
import com.example.drawIt.DTO.LobbyResponseDTO;
import com.example.drawIt.Service.LobbyService;
import com.example.drawIt.Entity.Lobby;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class LobbyController {

    private final LobbyService lobbyService;

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
}
