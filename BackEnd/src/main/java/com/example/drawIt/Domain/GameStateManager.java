package com.example.drawIt.Domain;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

@Component
public class GameStateManager {

    // roomId -> GameState
    private final Map<String, GameState> games = new ConcurrentHashMap<>();

    public GameState createGame(String roomId, String drawerUserId) {
        GameState state = new GameState(roomId, drawerUserId);
        games.put(roomId, state);
        return state;
    }

    public GameState getGame(String roomId) {
        return games.get(roomId);
    }

    public void removeGame(String roomId) {
        games.remove(roomId);
    }

    public String pickRandomDrawer(List<Map<String, Object>> users) {
        if (users == null || users.isEmpty()) {
            throw new IllegalArgumentException("drawer 선정 불가: 유저 없음");
        }

        int index = ThreadLocalRandom.current().nextInt(users.size());
        Object userId = users.get(index).get("userId");

        if (userId == null) {
            throw new IllegalStateException("userId 없음");
        }

        return userId.toString();
    }
}
