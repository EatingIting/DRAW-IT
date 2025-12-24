package com.example.drawIt.Domain;

import lombok.Getter;

import java.util.*;

@Getter
public class WordChainState {

    private boolean started = false;
    private boolean finished = false;

    private String currentWord;

    private List<String> playerIds = new ArrayList<>();
    private Map<String, String> nickById = new HashMap<>();

    private int currentTurnIndex = 0;
    private String turnUserId;

    private Set<String> usedWords = new HashSet<>();

    private int round = 0;
    private long turnStartAt = 0L;

    // ✅ 점수 관리
    private final Map<String, Integer> scoreByUserId = new HashMap<>();

    public void setTurnUserId(String turnUserId) {
        this.turnUserId = turnUserId;
    }

    public void setTurnStartAt(long turnStartAt) {
        this.turnStartAt = turnStartAt;
    }

    /* =========================
       게임 시작
    ========================= */
    public void start(String startWord, List<UserSnapshot> users) {
        started = true;
        finished = false;

        currentWord = startWord;
        usedWords.clear();
        playerIds.clear();
        nickById.clear();
        scoreByUserId.clear();

        for (UserSnapshot u : users) {
            playerIds.add(u.userId);
            nickById.put(u.userId, u.nickname);
            scoreByUserId.put(u.userId, 0); // ⭐ 초기 점수
        }

        currentTurnIndex = 0;
        turnUserId = playerIds.get(0);

        round = 0;
        turnStartAt = System.currentTimeMillis();
    }

    /* =========================
       플레이어 동기화
    ========================= */
    public void syncPlayers(List<UserSnapshot> users) {
        playerIds.clear();
        nickById.clear();

        for (UserSnapshot u : users) {
            playerIds.add(u.userId);
            nickById.put(u.userId, u.nickname);
            scoreByUserId.putIfAbsent(u.userId, 0); // ⭐ 중간 입장 대응
        }

        if (!playerIds.contains(turnUserId) && !playerIds.isEmpty()) {
            currentTurnIndex = 0;
            turnUserId = playerIds.get(0);
            turnStartAt = System.currentTimeMillis();
        }
    }

    /* =========================
       단어 제출
    ========================= */
    public boolean submit(String userId, String word) {
        if (!started || finished) return false;
        if (!userId.equals(turnUserId)) return false;
        if (usedWords.contains(word)) return false;

        char last = currentWord.charAt(currentWord.length() - 1);
        char first = word.charAt(0);
        if (last != first) return false;

        usedWords.add(word);
        currentWord = word;

        return true;
    }

    /* =========================
       점수 증가
    ========================= */
    public void addScore(String userId, int delta) {
        scoreByUserId.put(userId,
                scoreByUserId.getOrDefault(userId, 0) + delta);
    }

    /* =========================
       턴 변경 + 타이머 초기화
    ========================= */
    public void onNextTurn() {
        round++;

        currentTurnIndex = (currentTurnIndex + 1) % playerIds.size();
        turnUserId = playerIds.get(currentTurnIndex);

        turnStartAt = System.currentTimeMillis();
    }

    /* =========================
       라운드 제한시간
    ========================= */
    public int getTurnTimeLimitSeconds() {
        int limit = 60 - round;
        return Math.max(limit, 1);
    }

    /* =========================
       타임오버 판정
    ========================= */
    public boolean isTimeOver(long now) {
        if (!started || finished) return false;

        long elapsed = (now - turnStartAt) / 1000;
        return elapsed >= getTurnTimeLimitSeconds();
    }

    /* =========================
       게임 종료
    ========================= */
    public void finish() {
        finished = true;
        started = false;
    }

    /* =========================
       유저 스냅샷
    ========================= */
    public static class UserSnapshot {
        public String userId;
        public String nickname;

        public UserSnapshot(String userId, String nickname) {
            this.userId = userId;
            this.nickname = nickname;
        }
    }

    public List<String> getWinnerUserIds() {
        if (scoreByUserId.isEmpty()) return List.of();

        int maxScore = scoreByUserId.values()
                .stream()
                .max(Integer::compareTo)
                .orElse(0);

        return scoreByUserId.entrySet()
                .stream()
                .filter(e -> e.getValue() == maxScore)
                .map(Map.Entry::getKey)
                .toList();
    }

    public List<String> getWinnerNicknames() {
        return getWinnerUserIds()
                .stream()
                .map(id -> nickById.getOrDefault(id, id))
                .toList();
    }
}
