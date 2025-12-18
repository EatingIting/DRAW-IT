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
    private long roundEndTime;    // 타이머 종료 시간
    private int currentRound = 1; // 현재 라운드(1~10)
    public static final int MAX_ROUND = 10; //총 라운드 10

    // 동시성 문제를 방지하기 위해 CopyOnWriteArrayList 사용 (좋습니다!)
    private List<DrawEvent> drawEvents = new CopyOnWriteArrayList<>();
    private Stack<DrawEvent> redoStack = new Stack<>();

    private Set<String> drawnUserIds = new HashSet<>();

    // ✅ 생성자 수정: roomId와 drawerUserId 두 개를 받도록 변경
    public GameState(String roomId, String drawerUserId) {
        this.roomId = roomId;
        this.drawerUserId = drawerUserId;
        this.drawnUserIds.add(drawerUserId);
    }
}