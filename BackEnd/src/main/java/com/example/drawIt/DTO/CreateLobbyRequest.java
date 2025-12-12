package com.example.drawIt.DTO;

import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class CreateLobbyRequest {

    private String lobbyName;
    private String mode;
    private String password;
}
