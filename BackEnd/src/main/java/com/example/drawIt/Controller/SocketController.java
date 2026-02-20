package com.example.drawIt.Controller;

import com.example.drawIt.DTO.SocketJoinDTO;
import com.example.drawIt.DTO.SocketProfileDTO;
import com.example.drawIt.Domain.DrawEvent;
import com.example.drawIt.Domain.GameMode;
import com.example.drawIt.Domain.GameState;
import com.example.drawIt.Domain.GameStateManager;
import com.example.drawIt.Domain.WordChainGameManager;
import com.example.drawIt.Domain.WordChainState;
import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Service.GameImageService;
import com.example.drawIt.Service.LobbyService;
import com.example.drawIt.Service.MonRnkService;
import com.example.drawIt.Socket.LobbyUserStore;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Controller
@RequiredArgsConstructor
public class SocketController {

    private final LobbyUserStore lobbyUserStore;
    private final LobbyService lobbyService;
    private final SimpMessagingTemplate messagingTemplate;
    private final GameStateManager gameStateManager;
    private final WordChainGameManager wordChainGameManager;
    private final GameImageService gameImageService;
    private final MonRnkService monRnkService;

    private static final int ROUND_DURATION_SECONDS = 60;

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    private final Set<String> endingLobbies = ConcurrentHashMap.newKeySet();

    @MessageMapping("/lobby/{roomId}/join")
    public void join(@DestinationVariable("roomId") String roomId,
                     @Payload SocketJoinDTO dto,
                     StompHeaderAccessor accessor) {
        String sessionId = Objects.requireNonNull(accessor.getSessionId());
        lobbyUserStore.addUser(roomId, sessionId, dto.getUserId(), dto.getNickname());

        Lobby lobby = lobbyService.getLobby(roomId);
        GameState state = gameStateManager.getGame(roomId);
        boolean gameStarted = (state != null);
        String drawerUserId = (state != null) ? state.getDrawerUserId() : null;
        String currentWord = (state != null) ? state.getCurrentWord() : null;

        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "USER_UPDATE");
        payload.put("users", lobbyUserStore.getUsers(roomId));
        payload.put("hostUserId", lobby.getHostUserId());
        payload.put("gameStarted", gameStarted);
        payload.put("drawerUserId", drawerUserId);
        if (gameStarted && currentWord != null) payload.put("word", currentWord);

        // Sync round timer when users join during an active game.
        if (gameStarted) {
            long endTime = state.getRoundEndTime();
            payload.put("roundEndTime", endTime);
            payload.put("serverNow", System.currentTimeMillis());
        }

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, payload);

        // Sync drawing history for users who join in the middle of a round.
        if (state != null && !state.getDrawEvents().isEmpty()) {
            Map<String, Object> historyPayload = new HashMap<>();
            List<Map<String, Object>> activeHistory = new ArrayList<>();

            for (DrawEvent evt : state.getDrawEvents()) {
                activeHistory.add(convertEventToMap(evt));
            }

            historyPayload.put("history", activeHistory);
            List<Map<String, Object>> redoHistory = new ArrayList<>();

            for (DrawEvent evt : state.getRedoStack()) {
                redoHistory.add(convertEventToMap(evt));
            }

            historyPayload.put("redoStack", redoHistory);
            messagingTemplate.convertAndSend("/topic/history/" + dto.getUserId(), historyPayload);
        }
    }

    private Map<String, Object> convertEventToMap(DrawEvent evt) {
        Map<String, Object> map = new HashMap<>();
        map.put("type", evt.getType());
        map.put("x", evt.getX());
        map.put("y", evt.getY());
        map.put("color", evt.getColor());
        map.put("width", evt.getLineWidth());
        map.put("userId", evt.getUserId());
        map.put("tool", evt.getTool());
        map.put("points", evt.getPoints());
        return map;
    }

    @MessageMapping("/lobby/{roomId}/start")
    public void startGame(@DestinationVariable("roomId") String roomId) {
        var users = lobbyUserStore.getUsers(roomId);

        if (users == null || users.size() < 2) {
            messagingTemplate.convertAndSend(
                    "/topic/lobby/" + roomId,
                    Map.of("type", "GAME_START_DENIED", "reason", "NOT_ENOUGH_PLAYERS")
            );
            return;
        }

        lobbyService.markGameStarted(roomId);

        Lobby lobby = lobbyService.getLobby(roomId);
        String mode = normalizeMode(lobby.getMode());
        if (GameMode.WORD_CHAIN.name().equals(mode)) {
            startWordChainGame(roomId, users);
            return;
        }

        String drawerUserId = gameStateManager.pickRandomDrawer(users);
        GameState state = gameStateManager.createGame(roomId, drawerUserId, mode, ROUND_DURATION_SECONDS);
        state.setRoundEndTime(0L);

        // Notify pre-round state; round will start after a short delay.
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "GAME_START",
                "mode", mode,
                "drawerUserId", drawerUserId,
                "word", state.getCurrentWord(),
                "gameStarted", true,
                "roundEndTime", 0L,
                "serverNow", System.currentTimeMillis()
        ));

        scheduler.schedule(() -> startRealGame(roomId), 3, TimeUnit.SECONDS);
    }

    private void startWordChainGame(String roomId, List<Map<String, Object>> users) {
        List<WordChainState.UserSnapshot> snapshots = users.stream()
                .map(u -> new WordChainState.UserSnapshot(
                        String.valueOf(u.get("userId")),
                        String.valueOf(u.get("nickname"))
                ))
                .collect(Collectors.toList());

        if (snapshots.size() < 2) {
            messagingTemplate.convertAndSend(
                    "/topic/lobby/" + roomId,
                    Map.of("type", "GAME_START_DENIED", "reason", "NOT_ENOUGH_PLAYERS")
            );
            return;
        }

        WordChainState state = wordChainGameManager.getOrCreate(roomId);
        String startWord;
        try {
            startWord = wordChainGameManager.pickFirstWord();
        } catch (Exception e) {
            messagingTemplate.convertAndSend(
                    "/topic/wordchain/" + roomId,
                    Map.of("type", "START_DENIED", "reason", "WORD_NOT_FOUND")
            );
            return;
        }

        state.startWithDelay(startWord, snapshots, 3000);
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
        payload.put("lastAction", "START");
        payload.put("message", "GAME_START");
        payload.put("scoreByUserId", state.getScoreByUserId());
        messagingTemplate.convertAndSend("/topic/wordchain/" + roomId, payload);

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "GAME_START",
                "mode", GameMode.WORD_CHAIN.name(),
                "gameStarted", true
        ));
    }

    private String normalizeMode(String rawMode) {
        if (rawMode == null) return GameMode.RANDOM.name();
        String mode = rawMode.trim().toUpperCase();
        if ("WORDCHAIN".equals(mode) || "끝말잇기".equals(rawMode.trim())) {
            return GameMode.WORD_CHAIN.name();
        }
        return mode;
    }

    @MessageMapping("/lobby/{roomId}/nickname")
    public void changeNickname(@DestinationVariable("roomId") String roomId,
                               @Payload Map<String, String> payload) {
        String userId = payload.get("userId");
        String nickname = payload.get("nickname");

        lobbyUserStore.changeNickname(roomId, userId, nickname);
    }

    @MessageMapping("/lobby/{roomId}/leave")
    public void leave(@DestinationVariable("roomId") String roomId,
                      @Payload Map<String, String> payload) {
        String userId = payload.get("userId");

        lobbyUserStore.leaveRoom(roomId, userId);

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                Map.of("type", "USER_UPDATE", "users", lobbyUserStore.getUsers(roomId))
        );
    }

    @MessageMapping("/draw/{roomId}")
    public void handleDraw(@DestinationVariable("roomId") String roomId, @Payload DrawEvent evt) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;
        if (!evt.getUserId().equals(state.getDrawerUserId())) return;

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId + "/draw", evt);

        switch (evt.getType()) {
            case "END":
                if (evt.getPoints() != null && !evt.getPoints().isEmpty()) {
                    evt.setType("STROKE");
                    state.getDrawEvents().add(evt);
                    state.getRedoStack().clear();
                }
                break;
            case "FILL":
            case "CLEAR":
                state.getDrawEvents().add(evt);
                state.getRedoStack().clear();
                break;
            case "UNDO":
                if (!state.getDrawEvents().isEmpty()) {
                    state.getRedoStack().push(state.getDrawEvents().remove(state.getDrawEvents().size() - 1));
                }
                break;
            case "REDO":
                if (!state.getRedoStack().isEmpty()) {
                    state.getDrawEvents().add(state.getRedoStack().pop());
                }
                break;
        }

        if (state.getDrawEvents().size() > 5000) {
            state.getDrawEvents().remove(0);
        }
    }

    @MessageMapping("/draw/{roomId}/clear")
    public void clear(@DestinationVariable("roomId") String roomId,
                      @Payload Map<String, Object> payload) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;

        Object userIdObj = payload.get("userId");
        if (userIdObj == null || !userIdObj.toString().equals(state.getDrawerUserId())) return;

        DrawEvent clearEvent = new DrawEvent();
        clearEvent.setType("CLEAR");
        clearEvent.setUserId(userIdObj.toString());
        state.getDrawEvents().add(clearEvent);
        state.getRedoStack().clear();

        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId + "/draw",
                Map.of("type", "CLEAR", "userId", userIdObj)
        );
    }

    @MessageMapping("/chat/bubble")
    public void chatBubble(@Payload Map<String, Object> payload) {
        String roomId = (String) payload.get("lobbyId");
        String userId = (String) payload.get("userId");
        String message = (String) payload.get("message");

        messagingTemplate.convertAndSend(
                "/topic/chat/bubble",
                Map.of("type", "CHAT_BUBBLE", "userId", userId, "message", message)
        );

        GameState state = gameStateManager.getGame(roomId);
        if (state != null && message.trim().equals(state.getCurrentWord())) {
            if (userId.equals(state.getDrawerUserId())) return;

            String winnerNickname = lobbyUserStore.getUsers(roomId).stream()
                    .filter(u -> u.get("userId").equals(userId))
                    .map(u -> (String) u.get("nickname"))
                    .findFirst()
                    .orElse("(unknown)");

            System.out.println("[Server] correct answer by: " + winnerNickname);

            lobbyUserStore.addScore(roomId, userId, 10);
            if (state.getDrawerUserId() != null) {
                lobbyUserStore.addScore(roomId, state.getDrawerUserId(), 5);
            }

            messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                    "type", "USER_UPDATE",
                    "users", lobbyUserStore.getUsers(roomId),
                    "gameStarted", true
            ));

            messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                    "type", "CORRECT_ANSWER",
                    "winnerUserId", userId,
                    "winnerNickname", winnerNickname,
                    "answer", state.getCurrentWord()
            ));

            scheduler.schedule(() -> processNextRound(roomId), 4, TimeUnit.SECONDS);
        }
    }

    private void processNextRound(String roomId) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;

        var users = lobbyUserStore.getUsers(roomId);
        if (users.isEmpty()) {
            gameStateManager.removeGame(roomId);
            return;
        }

        int nextRound = state.getCurrentRound() + 1;

        if (nextRound > GameState.MAX_ROUND) {
            if (endingLobbies.contains(roomId)) {
                return;
            }
            endingLobbies.add(roomId);

            messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                    "type", "GAME_OVER",
                    "totalRounds", GameState.MAX_ROUND
            ));

            System.out.println("[Server] game over, waiting vote end: " + roomId);

            scheduler.schedule(() -> finishVoteAndSave(roomId), 30, TimeUnit.SECONDS);
            return;
        }

        state.setCurrentRound(nextRound);

        String newDrawer = gameStateManager.pickNextDrawer(state, users);
        state.setDrawerUserId(newDrawer);

        String newWord = gameStateManager.pickNextWord(state);
        state.setCurrentWord(newWord);

        state.getDrawEvents().clear();
        state.getRedoStack().clear();
        state.setRoundEndTime(0L);

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "DRAWER_CHANGED",
                "drawerUserId", newDrawer,
                "word", newWord,
                "currentRound", state.getCurrentRound(),
                "roundEndTime", 0L,
                "serverNow", System.currentTimeMillis()
        ));

        scheduler.schedule(() -> startRealGame(roomId), 3, TimeUnit.SECONDS);
    }

    private void startRealGame(String roomId) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;

        long durationMs = state.getRoundDuration() * 1000L;
        long endTime = System.currentTimeMillis() + durationMs;
        state.setRoundEndTime(endTime);

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "ROUND_START",
                "roundEndTime", endTime
        ));

        final int currentRound = state.getCurrentRound();
        scheduler.schedule(() -> checkAndTimeOver(roomId, currentRound), durationMs, TimeUnit.MILLISECONDS);
    }

    private void checkAndTimeOver(String roomId, int scheduledRound) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;

        if (state.getCurrentRound() != scheduledRound) {
            return;
        }

        System.out.println("[Server] time over (room: " + roomId + ")");

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of("type", "TIME_OVER"));

        scheduler.schedule(() -> {
            GameState currentState = gameStateManager.getGame(roomId);
            if (currentState != null && currentState.getCurrentRound() == scheduledRound) {
                processNextRound(roomId);
            }
        }, 3, TimeUnit.SECONDS);
    }

    private synchronized void finishVoteAndSave(String roomId) {
        if (lobbyUserStore.getUsers(roomId).isEmpty()) return;

        System.out.println("[Server] finish vote and save: " + roomId);

        try {
            List<Map<String, String>> winners = gameImageService.getWinners(roomId);

            if (!winners.isEmpty()) {
                monRnkService.saveWinners(winners);
                System.out.println("[Server] monthly ranking saved: " + winners.size() + " entries");
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            gameImageService.clearRoomData(roomId);
            gameStateManager.removeGame(roomId);
            endingLobbies.remove(roomId);

            System.out.println("[Server] room cleanup finished: " + roomId);
        }
    }

    @MessageMapping("/vote/{lobbyId}")
    public void handleVote(@DestinationVariable("lobbyId") String lobbyId,
                           @Payload Map<String, Object> payload) {
        try {
            Integer voteIndex = (Integer) payload.get("voteIndex");
            String userId = (String) payload.get("userId");

            System.out.println("[Controller] vote request: lobby=" + lobbyId + ", idx=" + voteIndex + ", user=" + userId);

            List<Integer> latestVoteCounts = gameImageService.addVote(lobbyId, voteIndex, userId);
            messagingTemplate.convertAndSend("/topic/vote/" + lobbyId, latestVoteCounts);

            System.out.println("[Controller] vote counts broadcast: " + latestVoteCounts);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @MessageMapping("/lobby/{roomId}/profile")
    public void updateProfile(@DestinationVariable("roomId") String roomId,
                              @Payload SocketProfileDTO dto) {
        System.out.println("[Server] profile update requested");
        if (dto.getUserId() == null) return;

        lobbyUserStore.updateProfile(
                roomId,
                dto.getUserId(),
                dto.getNickname(),
                dto.getProfileImage()
        );
    }
}
