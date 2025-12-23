package com.example.drawIt.DTO;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class UserResponseDTO {

    // 유저 고유 식별자 (재접속 핵심)
    private String userId;

    // 화면 표시용 닉네임 (식별용 아님)
    private String nickname;

    // 방장 여부 (JSON 직렬화 안전)
    private boolean host;
}
