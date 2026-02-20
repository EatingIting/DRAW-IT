package com.example.drawIt.Domain;

import com.example.drawIt.Entity.WordDictionary;
import com.example.drawIt.Repository.WordDictionaryRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class WordChainGameManager {

    private final WordDictionaryRepository wordDictionaryRepository;
    private final SimpMessagingTemplate messagingTemplate;

    private final Map<String, WordChainState> games = new ConcurrentHashMap<>();
    private final Random random = new Random();

    public WordChainGameManager(WordDictionaryRepository wordDictionaryRepository,
                                SimpMessagingTemplate messagingTemplate) {
        this.wordDictionaryRepository = wordDictionaryRepository;
        this.messagingTemplate = messagingTemplate;
    }

    public WordChainState getOrCreate(String roomId) {
        WordChainState state = games.get(roomId);
        if (state == null) {
            state = new WordChainState();
            games.put(roomId, state);
        }
        return state;
    }

    public WordChainState get(String roomId) {
        return games.get(roomId);
    }

    public void remove(String roomId) {
        games.remove(roomId);
    }

    /* =========================
       시작 단어 선택
    ========================= */
    public String pickFirstWord() {
        String[] chars = {"가","나","다","라","마","바","사","아","자","차","카","타","파","하"};
        String firstChar = chars[random.nextInt(chars.length)];

        WordDictionary word = pickReusableWord(firstChar);

        if (word == null) {
            throw new IllegalStateException("시작 단어를 찾을 수 없습니다.");
        }

        word.markUsed();
        wordDictionaryRepository.save(word);

        return word.getWord();
    }

    /* =========================
       다음 단어 선택
    ========================= */
    public String pickNextWord(String lastChar) {
        WordDictionary word = pickReusableWord(lastChar);

        if (word == null) {
            return null; // 더 이상 이어갈 단어 없음
        }

        word.markUsed();
        wordDictionaryRepository.save(word);

        return word.getWord();
    }

    private WordDictionary pickReusableWord(String firstChar) {
        WordDictionary word = wordDictionaryRepository.findRandomByFirstChar(firstChar).orElse(null);
        if (word != null) return word;

        // 모든 단어가 소진된 경우 used 플래그를 초기화하고 재시도
        wordDictionaryRepository.resetAllUsedFlags();
        word = wordDictionaryRepository.findRandomByFirstChar(firstChar).orElse(null);
        if (word != null) return word;

        // used 상태와 무관하게라도 단어가 있으면 시작 가능하도록 마지막 fallback
        return wordDictionaryRepository.findAnyRandomByFirstChar(firstChar).orElse(null);
    }

    public boolean existsInDictionary(String word) {
        if (word == null || word.isBlank()) return false;
        return wordDictionaryRepository.existsByWord(word);
    }

    public boolean handleTimeOver(String roomId, WordChainState state) {
        if (state == null || !state.isStarted()) return false;

        // 타임아웃이 5번 누적되면 게임 종료
        if ((state.getTimeoutCount() + 1) >= WordChainState.MAX_TIMEOUT_COUNT) {
            state.finish();
            messagingTemplate.convertAndSend(
                    "/topic/wordchain/" + roomId,
                    Map.of(
                            "type", "WORD_CHAIN_END",
                            "reason", "TIME_OVER",
                            "winners", state.getWinnerNicknames(),
                            "timeoutCount", state.getTimeoutCount() + 1
                    )
            );
            return true;
        }

        state.increaseTimeoutCount();
        state.onNextTurn();

        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "WORD_CHAIN_STATE");
        payload.put("started", state.isStarted());
        payload.put("currentWord", state.getCurrentWord());
        payload.put("playerIds", state.getPlayerIds());
        payload.put("nickById", state.getNickById());
        payload.put("turnUserId", state.getTurnUserId());
        payload.put("round", state.getRound());
        payload.put("turnStartAt", state.getTurnStartAt());
        payload.put("turnTimeLimit", state.getTurnTimeLimitSeconds());
        payload.put("lastAction", "TIME_OVER");
        payload.put("message", "시간 초과! 다음 턴으로 넘어갑니다.");
        payload.put("scoreByUserId", state.getScoreByUserId());
        payload.put("timeoutCount", state.getTimeoutCount());
        messagingTemplate.convertAndSend("/topic/wordchain/" + roomId, payload);

        return false;
    }

    @Scheduled(fixedRate = 500)
    public void checkTimeOver() {

        long now = System.currentTimeMillis();

        for (Map.Entry<String, WordChainState> entry : games.entrySet()) {
            String roomId = entry.getKey();
            WordChainState state = entry.getValue();

            if (!state.isStarted()) continue;

            if (state.isTimeOver(now)) {
                handleTimeOver(roomId, state);
            }
        }
    }
}
