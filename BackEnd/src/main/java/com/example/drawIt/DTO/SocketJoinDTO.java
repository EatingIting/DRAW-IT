package com.example.drawIt.DTO;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class SocketJoinDTO {
    private String roomId;
    private String userId;
    private String nickname;
}