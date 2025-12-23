package com.example.drawIt.Domain;

import org.springframework.stereotype.Component;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Component
public class GameStateManager {

    private final Map<String, GameState> games = new ConcurrentHashMap<>();
    private final WordProvider wordProvider;

    public GameStateManager(WordProvider wordProvider) {
        this.wordProvider = wordProvider;
    }

    public GameState createGame(String roomId, String drawerUserId, String mode, int roundDuration) {
        GameState state = new GameState(roomId, drawerUserId, mode, roundDuration);
        String word = wordProvider.pickUniqueWord(state, mode);
        state.setCurrentWord(word);

        // 게임 생성 시 종료 시간 설정 (60초)
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

    /*public String getUniqueWord(GameState state, String mode) {
        // 1. 전체 단어에서 이미 사용된 단어 제외하고 리스트에 담기
        List<String> availableWords = new ArrayList<>();
        Set<String> usedWords = state.getUsedWords();
        List<String> wordList =
                wordPoolByMode.getOrDefault(mode, wordPoolByMode.get("RANDOM"));

        for (String w : wordList) {
            // 이미 사용된 단어(usedWords)에 포함되지 않은 것만 추가
            if (!usedWords.contains(w)) {
                availableWords.add(w);
            }
        }

        // 2. 만약 모든 단어를 다 썼다면? -> 다시 전체 리스트를 사용하고 기록 초기화
        if (availableWords.isEmpty()) {
            state.getUsedWords().clear();
            // wordList의 모든 요소를 availableWords에 복사
            availableWords.addAll(wordList);
        }

        // 랜덤으로 하나 뽑기
        String picked = availableWords.get(new Random().nextInt(availableWords.size()));

        // 사용된 단어 목록에 추가
        state.getUsedWords().add(picked);

        return picked;
    }*/

    public String pickRandomDrawer(List<Map<String, Object>> users) {
        if (users == null || users.isEmpty()) return null;
        int idx = new Random().nextInt(users.size());
        return (String) users.get(idx).get("userId");
    }

    public String pickNextDrawer(GameState state, List<Map<String, Object>> users) {
        if (users == null || users.isEmpty()) return null;

        int totalRounds = GameState.MAX_ROUND; // 10
        int userCount = users.size();

        // 인당 최소 보장 횟수 계산
        int guaranteedTurns = totalRounds / userCount;
        if (guaranteedTurns < 1) guaranteedTurns = 1;

        Map<String, Integer> counts = state.getDrawCounts();
        List<String> candidates = new ArrayList<>();

        // 아직 할당량을 못 채운 사람들만 후보로 선정 (Quota 필터링)
        for (Map<String, Object> user : users) {
            String uid = (String) user.get("userId");

            // 현재 유저의 출제 횟수 가져오기 (없으면 0)
            int currentCount = 0;
            if (counts.containsKey(uid)) {
                currentCount = counts.get(uid);
            }

            // 보장 횟수보다 적게 출제한 사람만 후보에 추가
            if (currentCount < guaranteedTurns) {
                candidates.add(uid);
            }
        }

        // 만약 모두가 할당량을 채워서 후보가 없다면
        // 남은 라운드는 전체 유저 중에서 랜덤으로 진행
        if (candidates.isEmpty()) {
            for (Map<String, Object> user : users) {
                String uid = (String) user.get("userId");
                candidates.add(uid);
            }
        }

        // 후보군 내에서 완전 랜덤 추첨
        int idx = new Random().nextInt(candidates.size());
        String nextDrawer = candidates.get(idx);

        // 카운트 증가
        int nextDrawerCount = 0;
        if (counts.containsKey(nextDrawer)) {
            nextDrawerCount = counts.get(nextDrawer);
        }
        counts.put(nextDrawer, nextDrawerCount + 1);

        return nextDrawer;
    }

    public String pickNextWord(GameState state) {
        String word = wordProvider.pickUniqueWord(state, state.getMode());
        state.setCurrentWord(word);
        return word;
    }
}