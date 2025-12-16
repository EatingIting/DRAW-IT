package com.example.drawIt.DTO;

import com.example.drawIt.Entity.Lobby;
import lombok.Getter;

@Getter
public class LobbyResponseDTO {
    private final String id;
    private final String name;
    private final String mode;
    private final String hostNickname;

    public LobbyResponseDTO(Lobby lobby) {
        this.id = lobby.getId();
        this.name = lobby.getName();
        this.mode = lobby.getMode();
        this.hostNickname = lobby.getHostNickname();
    }
}
