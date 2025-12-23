package com.example.drawIt.Socket;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UserSessionState {
    public String userId;
    public String nickname;
    public boolean host;

    private Object profileImage;

    public String sessionId;     // 현재 연결된 ws sessionId
    public long disconnectAt;    // 끊긴 시각(ms), 0이면 연결중

    private long joinedAt;       // 입장 시간

    private int score = 0;       // 점수 필드

    public UserSessionState(String userId, String nickname, boolean host) {
        this.userId = userId;
        this.nickname = nickname;
        this.host = host;
        this.disconnectAt = 0;
        this.joinedAt = System.currentTimeMillis();
        this.score = 0; //초기점수 0
        this.profileImage = "default";
    }
}