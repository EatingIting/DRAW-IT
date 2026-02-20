package com.example.drawIt.Domain;

import lombok.Getter;

import java.util.*;

@Getter
public class WordChainState {
    public static final int MAX_TIMEOUT_COUNT = 5;

    private boolean started = false;
    private boolean finished = false;

    private String currentWord;

    private List<String> playerIds = new ArrayList<>();
    private Map<String, String> nickById = new HashMap<>();

    private int currentTurnIndex = 0;
    private String turnUserId;

    private Set<String> usedWords = new HashSet<>();

    private int round = 0;
    private int timeoutCount = 0;
    private long turnStartAt = 0L;

    private double turnLimitSec = 15;

    // 최소 제한 시간
    private static final double MIN_TURN_LIMIT = 5.0;

    // 감소 단위
    private static final double DECREASE_STEP = 0.5;

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
        timeoutCount = 0;
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
        if (playerIds.isEmpty()) return;

        round++;

        currentTurnIndex = (currentTurnIndex + 1) % playerIds.size();
        turnUserId = playerIds.get(currentTurnIndex);

        turnStartAt = System.currentTimeMillis();
    }

    /* =========================
       라운드 제한시간
    ========================= */
    public double getTurnTimeLimitSeconds() {
        return turnLimitSec;
    }

    /* =========================
       시간 보정
    ============================ */
    public void startWithDelay(String startWord, List<UserSnapshot> users, long delayMs) {
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
            scoreByUserId.put(u.userId, 0);
        }

        currentTurnIndex = 0;
        turnUserId = playerIds.get(0);

        round = 0;
        timeoutCount = 0;

        turnLimitSec = 15.0;

        turnStartAt = System.currentTimeMillis() + delayMs;
    }

    /* =========================
       타임오버 판정
    ========================= */

    public boolean isTimeOver(long now) {
        if (!started) return false;
        return now - turnStartAt >= (long) (turnLimitSec * 1000);
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

    public void prepare(String startWord) {
        this.started = false;
        this.finished = false;
        this.currentWord = startWord;
    }

    public void startRealTurn() {
        this.started = true;
        this.finished = false;
        this.turnStartAt = System.currentTimeMillis();
    }

    public void decreaseTurnLimit() {
        turnLimitSec = Math.max(
                MIN_TURN_LIMIT,
                turnLimitSec - DECREASE_STEP
        );
    }

    public void increaseTimeoutCount() {
        timeoutCount++;
    }
}
