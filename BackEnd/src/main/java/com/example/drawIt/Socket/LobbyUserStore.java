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

@Component
@RequiredArgsConstructor
public class LobbyUserStore {

    private final LobbyRepository lobbyRepository;
    private final GameStateManager gameStateManager;
    private final SimpMessagingTemplate messagingTemplate;

    // F5를 위한 유예 시간 (1.5초)
    private static final long GRACE_MS = 1500;

    // roomId -> (userId -> UserSessionState)
    private final Map<String, Map<String, UserSessionState>> rooms = new ConcurrentHashMap<>();

    // sessionId -> (roomId, userId)
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
            state.setDisconnectAt(0); // 부활
            state.setNickname(nickname);
        }

        state.setSessionId(sessionId);
        sessionIndex.put(sessionId, new String[]{roomId, userId});
    }

    /* =========================
       명시적 나가기 (버튼 클릭)
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
       연결 끊김 마킹 (F5/탭닫기)
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
       스케줄러 정리 (1.5초 타임아웃)
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

                if (state.getDisconnectAt() > 0 && (now - state.getDisconnectAt() > GRACE_MS)) {
                    it.remove();
                    if (state.getSessionId() != null) {
                        sessionIndex.remove(state.getSessionId());
                    }
                    System.out.println("⏳ Timeout Remove: " + state.getNickname());
                    processUserRemoval(roomId, users, state);
                    sendUserUpdate(roomId);
                }
            }
        }
    }

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

    // ✅ [수정] 출제자 변경 시 타이머 시간 설정
    private void handleGameLogicOnRemoval(String roomId, String userId) {
        if (userId == null) return;
        GameState state = gameStateManager.getGame(roomId);

        if (state != null && userId.equals(state.getDrawerUserId())) {
            List<Map<String, Object>> currentUsers = getUsers(roomId);

            if (currentUsers.size() >= 2) {
                String newDrawer = gameStateManager.pickRandomDrawer(currentUsers);
                state.setDrawerUserId(newDrawer);
                String newWord = gameStateManager.pickRandomWord();
                state.setCurrentWord(newWord);

                // ✅ 턴 종료 시간 갱신 (60초)
                long endTime = System.currentTimeMillis() + 60000;
                state.setRoundEndTime(endTime);

                messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                        "type", "DRAWER_CHANGED",
                        "drawerUserId", newDrawer,
                        "word", newWord,
                        "roundEndTime", endTime
                ));
            } else if (currentUsers.isEmpty()) {
                gameStateManager.removeGame(roomId);
            }
        }
    }

    private void sendUserUpdate(String roomId) {
        GameState state = gameStateManager.getGame(roomId);
        boolean gameStarted = (state != null);

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "USER_UPDATE",
                "users", getUsers(roomId),
                "gameStarted", gameStarted
        ));
    }

    // ✅ [중요 수정] 끊긴 유저(Loading 중인 유저)도 포함해서 반환해야 함!
    // 이걸 빼먹으면 화면 이동 중에 "유저 없음"으로 게임이 터집니다.
    public List<Map<String, Object>> getUsers(String roomId) {
        Map<String, UserSessionState> users = rooms.get(roomId);
        if (users == null) return List.of();

        List<Map<String, Object>> result = new ArrayList<>();
        for (UserSessionState u : users.values()) {
            // ⚠️ disconnectAt 체크 제거! (스케줄러가 지우기 전까진 살아있는 유저로 취급)
            result.add(Map.of(
                    "userId", u.getUserId(),
                    "nickname", u.getNickname(),
                    "host", u.isHost()
            ));
        }
        return result;
    }
}