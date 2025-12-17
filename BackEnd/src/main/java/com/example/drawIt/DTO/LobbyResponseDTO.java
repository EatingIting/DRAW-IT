package com.example.drawIt.DTO;

import com.example.drawIt.Entity.Lobby;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class LobbyResponseDTO {
    private String id;
    private String name;
    private String mode;
    private String hostNickname;
    private boolean gameStarted;
    private int currentCount;
    private int maxCount;

    public void setCurrentCount(int currentCount) { this.currentCount = currentCount; }
    public void setMaxCount(int maxCount) { this.maxCount = maxCount; }

    public LobbyResponseDTO(Lobby lobby) {
        this.id = lobby.getId();
        this.name = lobby.getName();
        this.mode = lobby.getMode();
        this.hostNickname = lobby.getHostNickname();
        this.gameStarted = lobby.isGameStarted();
    }
}
