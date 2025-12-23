package com.example.drawIt.DTO;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class SocketProfileDTO {
    private String userId;
    private String nickname;
    private Object profileImage; // 숫자나 문자열("default") 모두 받기 위해 Object
}