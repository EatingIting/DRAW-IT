package com.example.drawIt.DTO;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class UserResponseDTO {
    private String nickname; // 유저 이름
    private boolean isHost;  // 방장 여부 (true/false)
}