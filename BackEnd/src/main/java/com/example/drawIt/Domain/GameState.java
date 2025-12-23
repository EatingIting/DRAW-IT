package com.example.drawIt.Domain;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

@Getter
@Setter
public class GameState {

    private String roomId;        // 방 번호 필드 추가
    private String drawerUserId;  // 출제자 ID
    private String currentWord;   // 현재 제시어
    private String mode;

    private long roundEndTime;    // 타이머 종료 시간
    private int roundDuration;    // 라운드 남은 시간 (초단위)

    private int currentRound = 1; // 현재 라운드(1~10)
    public static final int MAX_ROUND = 1; //총 라운드 10

    // 동시성 문제를 방지하기 위해 CopyOnWriteArrayList 사용 (좋습니다!)
    private List<DrawEvent> drawEvents = new CopyOnWriteArrayList<>();
    private Stack<DrawEvent> redoStack = new Stack<>();

    private Map<String, Integer> drawCounts = new HashMap<>();

    private Set<String> usedWords = new HashSet<>(); //이미 출제된 단어 목록 (중복 방지용)

    // 생성자 수정: roomId와 drawerUserId 두 개를 받도록 변경
    public GameState(String roomId, String drawerUserId, String mode, int roundDuration) {
        this.roomId = roomId;
        this.drawerUserId = drawerUserId;
        this.drawCounts.put(drawerUserId, 1);
        this.mode = mode;
        this.roundDuration = roundDuration;
        this.roundEndTime = System.currentTimeMillis() + (roundDuration * 1000L);
    }

    public int getRemainingSeconds() {
        long now = System.currentTimeMillis();
        long remainMillis = roundEndTime - now;
        int remainSeconds = (int) (remainMillis / 1000);
        return Math.max(remainSeconds, 0);
    }

    public void startNextRound(String newDrawerUserId) {
        this.drawerUserId = newDrawerUserId;
        this.currentRound++;

        this.drawEvents.clear();
        this.redoStack.clear();

        this.roundEndTime = System.currentTimeMillis() + (roundDuration * 1000L);
    }

    public boolean isRoundEnded() {
        return getRemainingSeconds() <= 0;
    }
}