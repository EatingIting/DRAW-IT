package com.example.drawIt.Controller;

import com.example.drawIt.DTO.CreateLobbyRequest;
import com.example.drawIt.DTO.CreateLobbyResponse;
import com.example.drawIt.Service.LobbyService;
import com.example.drawIt.domain.Lobby;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@CrossOrigin(origins = "http://localhost:3000")
public class LobbyController {

    private LobbyService lobbyService;

    @PostMapping("/lobby")
    public ResponseEntity<CreateLobbyResponse> createLobby(@RequestBody CreateLobbyRequest request) {
        Lobby lobby = lobbyService.createLobby(request);

        return ResponseEntity.ok(
                new CreateLobbyResponse(
                        lobby.getId(),
                        lobby.getName()
                )
        );
    }
}
