package com.example.drawIt.DTO;

import lombok.Data;

@Data
public class SocketChatDTO {
    private String roomId;
    private String nickname;
    private String content;
}