package com.example.drawIt.DTO;

import lombok.Data;

@Data
public class GameImageDTO {
    private String lobbyId;
    private String userId;
    private String nickname; // 투표 화면에 표시할 그린 사람 이름
    private String keyword;
    private String base64Image; // "data:image/jpeg;base64,..." 형태의 문자열
}
