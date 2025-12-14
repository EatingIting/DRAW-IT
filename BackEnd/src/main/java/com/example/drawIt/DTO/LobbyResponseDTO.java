package com.example.drawIt.DTO;

import com.example.drawIt.Entity.Lobby;
import lombok.Getter;

@Getter
public class LobbyResponseDTO {
    private final Long id;
    private final String name;
    private final String mode;

    public LobbyResponseDTO(Lobby lobby) {
        this.id = lobby.getId();
        this.name = lobby.getName();
        this.mode = lobby.getMode();
    }
}
