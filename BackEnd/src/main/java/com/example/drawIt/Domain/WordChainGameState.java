package com.example.drawIt.Domain;

import lombok.Getter;
import lombok.Setter;

import java.util.*;

@Getter
@Setter
public class WordChainGameState {

    private boolean started;

    private String currentWord = "";
    private String turnUserId = "";

    private List<String> playerIds = new ArrayList<>();
    private Map<String, String> nickById = new HashMap<>();

    // ===== 타이머(서버 기준) =====
    // 턴 시작 시각(서버 epoch millis). 클라이언트는 이 값으로 남은 시간 계산
    private long turnStartAt = 0L;

    // 턴 제한 시간(초)
    private double turnLimitSec = 15;

    // ===== 부가 상태 =====
    private Set<String> usedWords = new HashSet<>();

    public boolean hasPlayers() {
        return playerIds != null && !playerIds.isEmpty();
    }

}
