package com.example.drawIt.Domain;

import org.springframework.stereotype.Component;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Component
public class GameStateManager {

    private final Map<String, GameState> games = new ConcurrentHashMap<>();

    // (단어 리스트는 기존 그대로 유지)
    private final List<String> wordList = Arrays.asList(
            "사과", "바나나", "노트북", "자동차", "비행기", "고양이", "강아지", "학교",
            "병원", "경찰서", "소방관", "축구", "농구", "야구", "피아노", "기타",
            "바다", "산", "우주", "별", "달", "해", "구름", "비", "눈", "크리스마스",
            "시계", "안경", "모자", "신발", "가방", "책", "연필", "지우개"
    );

    public GameState createGame(String roomId, String drawerUserId) {
        GameState state = new GameState(roomId, drawerUserId);
        state.setCurrentWord(pickRandomWord());

        // ✅ [추가] 게임 생성 시 종료 시간 설정 (60초)
        state.setRoundEndTime(System.currentTimeMillis() + 60000);

        games.put(roomId, state);
        return state;
    }

    public GameState getGame(String roomId) {
        return games.get(roomId);
    }

    public void removeGame(String roomId) {
        games.remove(roomId);
    }

    public String pickRandomWord() {
        return wordList.get(new Random().nextInt(wordList.size()));
    }

    public String pickRandomDrawer(List<Map<String, Object>> users) {
        if (users == null || users.isEmpty()) return null;
        int idx = new Random().nextInt(users.size());
        return (String) users.get(idx).get("userId");
    }

    public String pickNextDrawer(GameState state, List<Map<String, Object>> users) {
        if (users == null || users.isEmpty()) return null;

        // 1. 아직 출제 안 한 사람 찾기
        List<String> candidates = users.stream()
                .map(u -> (String) u.get("userId"))
                .filter(uid -> !state.getDrawnUserIds().contains(uid))
                .collect(Collectors.toList());

        String nextDrawer;

        // 2. 모든 사람이 한 번씩 다 했다면? -> 전체 유저 중에서 랜덤 (단, 방금 한 사람은 제외하면 좋음)
        if (candidates.isEmpty()) {
            candidates = users.stream()
                    .map(u -> (String) u.get("userId"))
                    .collect(Collectors.toList());
        }

        // 3. 후보군 중 랜덤 선정
        int idx = new Random().nextInt(candidates.size());
        nextDrawer = candidates.get(idx);

        // 4. 기록 추가
        state.getDrawnUserIds().add(nextDrawer);

        return nextDrawer;
    }
}