package com.example.drawIt.DTO;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class CreateLobbyResponse {
    private Long lobbyId;
    private String lobbyName;
}
