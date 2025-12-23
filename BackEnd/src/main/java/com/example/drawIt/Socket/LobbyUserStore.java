package com.example.drawIt.Socket;

import com.example.drawIt.Domain.GameState;
import com.example.drawIt.Domain.GameStateManager;
import com.example.drawIt.Repository.LobbyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class LobbyUserStore {

    private final LobbyRepository lobbyRepository;
    private final GameStateManager gameStateManager;
    private final SimpMessagingTemplate messagingTemplate;

    // F5 유예 시간
    private static final long GRACE_MS = 1500;

    private final Map<String, Map<String, UserSessionState>> rooms = new ConcurrentHashMap<>();
    private final Map<String, String[]> sessionIndex = new ConcurrentHashMap<>();

    /* =========================
       입장 / 재접속
    ========================= */
    @Transactional
    public synchronized void addUser(String roomId, String sessionId, String userId, String nickname) {

        rooms.putIfAbsent(roomId, new ConcurrentHashMap<>());
        Map<String, UserSessionState> users = rooms.get(roomId);

        UserSessionState state = users.get(userId);

        if (state == null) {
            boolean isFirst = users.isEmpty();
            state = new UserSessionState(userId, nickname, isFirst);
            users.put(userId, state);

            if (isFirst) {
                lobbyRepository.updateHost(roomId, userId, nickname);
            }
        } else {
            state.setDisconnectAt(0);
            state.setNickname(nickname);
        }

        state.setSessionId(sessionId);
        sessionIndex.put(sessionId, new String[]{roomId, userId});
    }

    /* =========================
       명시적 나가기
    ========================= */
    @Transactional
    public synchronized void leaveRoom(String roomId, String userId) {
        Map<String, UserSessionState> users = rooms.get(roomId);
        if (users == null) return;

        UserSessionState removed = users.remove(userId);
        if (removed != null && removed.getSessionId() != null) {
            sessionIndex.remove(removed.getSessionId());
        }

        processUserRemoval(roomId, users, removed);
        sendUserUpdate(roomId);
    }

    /* =========================
       연결 끊김 마킹
    ========================= */
    public synchronized void markDisconnected(String sessionId) {
        String[] info = sessionIndex.get(sessionId);
        if (info == null) return;

        String roomId = info[0];
        String userId = info[1];

        Map<String, UserSessionState> users = rooms.get(roomId);
        if (users != null) {
            UserSessionState state = users.get(userId);
            if (state != null) {
                state.setDisconnectAt(System.currentTimeMillis());
            }
        }
    }

    /* =========================
       주기적 정리 (F5 타임아웃)
    ========================= */
    @Transactional
    public synchronized void cleanup() {
        long now = System.currentTimeMillis();

        for (String roomId : new HashSet<>(rooms.keySet())) {
            Map<String, UserSessionState> users = rooms.get(roomId);
            if (users == null) continue;

            Iterator<UserSessionState> it = users.values().iterator();
            while (it.hasNext()) {
                UserSessionState state = it.next();

                if (state.getDisconnectAt() > 0 && now - state.getDisconnectAt() > GRACE_MS) {
                    it.remove();
                    if (state.getSessionId() != null) {
                        sessionIndex.remove(state.getSessionId());
                    }

                    processUserRemoval(roomId, users, state);
                    sendUserUpdate(roomId);
                }
            }
        }
    }

    /* =========================
       유저 제거 후 처리
    ========================= */
    private void processUserRemoval(String roomId, Map<String, UserSessionState> users, UserSessionState removed) {

        if (users.isEmpty()) {
            lobbyRepository.deleteById(roomId);
            rooms.remove(roomId);
            gameStateManager.removeGame(roomId);
            return;
        }

        if (removed != null && removed.isHost()) {
            UserSessionState next = users.values().iterator().next();
            next.setHost(true);
            lobbyRepository.updateHost(roomId, next.getUserId(), next.getNickname());
        }

        handleGameLogicOnRemoval(roomId, removed != null ? removed.getUserId() : null);
    }

    /* =========================
       출제자 이탈 시 게임 로직
    ========================= */
    private void handleGameLogicOnRemoval(String roomId, String removedUserId) {

        if (removedUserId == null) return;

        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;

        if (!removedUserId.equals(state.getDrawerUserId())) return;

        List<Map<String, Object>> users = getUsers(roomId);
        if (users.size() < 2) {
            gameStateManager.removeGame(roomId);
            return;
        }

        String newDrawer = gameStateManager.pickRandomDrawer(users);
        state.setDrawerUserId(newDrawer);

        // lobby에서 mode 조회
        String mode = lobbyRepository.findById(roomId)
                .map(l -> l.getMode())
                .orElse("RANDOM");

        String newWord = gameStateManager.pickNextWord(state);

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "DRAWER_CHANGED",
                "drawerUserId", newDrawer,
                "word", newWord
        ));

        new Timer().schedule(new TimerTask() {
            @Override
            public void run() {
                long endTime = System.currentTimeMillis() + 60000;
                state.setRoundEndTime(endTime);
                messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                        "type", "ROUND_START",
                        "roundEndTime", endTime
                ));
            }
        }, 3000);
    }

    /* =========================
       USER_UPDATE 전송
    ========================= */
    private void sendUserUpdate(String roomId) {
        GameState state = gameStateManager.getGame(roomId);

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "USER_UPDATE",
                "users", getUsers(roomId),
                "gameStarted", state != null
        ));
    }

    /* =========================
       유저 목록 반환
    ========================= */
    public List<Map<String, Object>> getUsers(String roomId) {

        Map<String, UserSessionState> users = rooms.get(roomId);
        if (users == null) return List.of();

        return users.values().stream()
                .sorted((a, b) -> {
                    if (a.isHost() && !b.isHost()) return -1;
                    if (!a.isHost() && b.isHost()) return 1;
                    return Long.compare(a.getJoinedAt(), b.getJoinedAt());
                })
                .map(u -> Map.<String, Object>of(
                        "userId", u.getUserId(),
                        "nickname", u.getNickname(),
                        "host", u.isHost(),
                        "score", u.getScore()
                ))
                .collect(Collectors.toList());
    }

    /* =========================
       점수 추가
    ========================= */
    public void addScore(String roomId, String userId, int score) {
        Map<String, UserSessionState> users = rooms.get(roomId);
        if (users == null) return;

        UserSessionState user = users.get(userId);
        if (user != null) {
            user.setScore(user.getScore() + score);
        }
    }
}
