package com.example.drawIt.DTO;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateLobbyDTO {
    private String id;
    private String name;
    private String mode;
    private String password;
    private String hostUserId;
    private String hostNickname;
}
