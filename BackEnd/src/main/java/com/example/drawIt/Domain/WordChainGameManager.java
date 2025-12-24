package com.example.drawIt.Domain;

import com.example.drawIt.Entity.WordDictionary;
import com.example.drawIt.Repository.WordDictionaryRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
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

        WordDictionary word = wordDictionaryRepository
                .findRandomByFirstChar(firstChar)
                .orElse(null);

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
        WordDictionary word = wordDictionaryRepository
                .findRandomByFirstChar(lastChar)
                .orElse(null);

        if (word == null) {
            return null; // 더 이상 이어갈 단어 없음
        }

        word.markUsed();
        wordDictionaryRepository.save(word);

        return word.getWord();
    }

    public boolean existsInDictionary(String word) {
        if (word == null || word.isBlank()) return false;
        return wordDictionaryRepository.existsByWord(word);
    }

    @Scheduled(fixedRate = 500)
    public void checkTimeOver() {

        long now = System.currentTimeMillis();

        for (Map.Entry<String, WordChainState> entry : games.entrySet()) {
            String roomId = entry.getKey();
            WordChainState state = entry.getValue();

            if (!state.isStarted()) continue;

            if (state.isTimeOver(now)) {
                state.finish();

                List<String> winners = state.getWinnerNicknames();

                messagingTemplate.convertAndSend(
                        "/topic/wordchain/" + roomId,
                        Map.of(
                                "type", "WORD_CHAIN_END",
                                "reason", "TIME_OVER",
                                "winners", state.getWinnerNicknames()
                        )
                );
                return;
            }
        }
    }
}
