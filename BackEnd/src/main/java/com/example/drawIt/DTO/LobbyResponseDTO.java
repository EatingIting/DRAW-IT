package com.example.drawIt.DTO;

import com.example.drawIt.Entity.Lobby;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.LocalDateTime;

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
    // 인원 수 추가된 필드
    private int currentCount;
    private int maxCount;
    // 자물쇠 필드
    private boolean passwordEnabled;
    private LocalDateTime createdAt;

    public void setCurrentCount(int currentCount) { this.currentCount = currentCount; }
    public void setMaxCount(int maxCount) { this.maxCount = maxCount; }

    public LobbyResponseDTO(Lobby lobby) {
        this.id = lobby.getId();
        this.name = lobby.getName();
        this.mode = lobby.getMode();
        this.hostNickname = lobby.getHostNickname();
        this.gameStarted = lobby.isGameStarted();
        // 비밀번호가 존재하고, 공백이 아니면 true
        this.passwordEnabled = lobby.getPassword() != null && !lobby.getPassword().isBlank();
        this.createdAt = lobby.getCreatedAt();
    }
}
