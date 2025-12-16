package com.example.drawIt.Socket;

import com.example.drawIt.Repository.LobbyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
@RequiredArgsConstructor
public class LobbyUserStore {

    private final LobbyRepository lobbyRepository;

    // roomId -> (userId -> UserSessionState)
    private final Map<String, Map<String, UserSessionState>> rooms = new ConcurrentHashMap<>();

    // sessionId -> (roomId, userId)
    private final Map<String, String[]> sessionIndex = new ConcurrentHashMap<>();

    private static final long GRACE_MS = 5000; // F5 보호 시간 (5초)

    /* =========================
       입장 / 재접속
    ========================= */
    @Transactional
    public synchronized void addUser(
            String roomId,
            String sessionId,
            String userId,
            String nickname
    ) {
        if (userId == null || nickname == null) {
            throw new IllegalArgumentException("❌ userId 또는 nickname 이 null 입니다");
        }

        rooms.putIfAbsent(roomId, new ConcurrentHashMap<>());
        Map<String, UserSessionState> users = rooms.get(roomId);

        UserSessionState state = users.get(userId);

        if (state == null) {
            boolean isFirst = users.isEmpty();
            state = new UserSessionState(userId, nickname, isFirst);
            users.put(userId, state);

            if (isFirst) {
                lobbyRepository.updateHost(roomId, state.userId, state.nickname);
            }
        } else {
            state.nickname = nickname;
        }

        state.sessionId = sessionId;
        state.disconnectAt = 0;

        sessionIndex.put(sessionId, new String[]{roomId, userId});
    }

    /* =========================
       명시적 나가기 (뒤로가기 버튼)
    ========================= */
    @Transactional
    public synchronized void leaveRoom(String roomId, String userId) {
        Map<String, UserSessionState> users = rooms.get(roomId);
        if (users == null) return;

        UserSessionState removed = users.remove(userId);

        if (users.isEmpty()) {
            lobbyRepository.deleteById(roomId);
            rooms.remove(roomId);
            return;
        }

        // 나간 사람이 방장이면 위임
        if (removed != null && removed.host) {
            UserSessionState next = users.values().iterator().next();
            next.host = true;
            lobbyRepository.updateHost(roomId, next.userId, next.nickname);
        }
    }

    /* =========================
       WebSocket 끊김 감지 (탭 닫기 / 브라우저 종료 / 링크 이동 등)
       -> F5는 GRACE_MS 이내 재접속하면 살아있음
    ========================= */
    public synchronized void removeSession(String sessionId) {
        String[] info = sessionIndex.remove(sessionId);
        if (info == null) return;

        String roomId = info[0];
        String userId = info[1];

        Map<String, UserSessionState> users = rooms.get(roomId);
        if (users == null) return;

        UserSessionState state = users.get(userId);
        if (state != null) {
            state.disconnectAt = System.currentTimeMillis();
        }
    }

    /* =========================
       주기적 정리 (스케줄러)
       - GRACE_MS 이후에도 재접속 안하면 유저 제거
       - 제거 결과 0명이면 방 삭제
       - 제거된 유저가 방장이면 남아있는 사람 중 1명에게 위임
    ========================= */
    @Transactional
    public synchronized void cleanup() {
        long now = System.currentTimeMillis();

        Iterator<Map.Entry<String, Map<String, UserSessionState>>> roomIt = rooms.entrySet().iterator();

        while (roomIt.hasNext()) {
            Map.Entry<String, Map<String, UserSessionState>> roomEntry = roomIt.next();
            String roomId = roomEntry.getKey();
            Map<String, UserSessionState> users = roomEntry.getValue();

            Iterator<UserSessionState> userIt = users.values().iterator();

            while (userIt.hasNext()) {
                UserSessionState state = userIt.next();

                if (state.disconnectAt > 0 && now - state.disconnectAt > GRACE_MS) {
                    boolean wasHost = state.host;
                    userIt.remove();

                    // 0명이면 즉시 방 삭제
                    if (users.isEmpty()) {
                        lobbyRepository.deleteById(roomId);
                        roomIt.remove();
                        break;
                    }

                    // 방장이 나갔으면 위임
                    if (wasHost) {
                        UserSessionState next = users.values().iterator().next();
                        next.host = true;
                        lobbyRepository.updateHost(roomId, next.userId, next.nickname);
                    }
                }
            }
        }
    }

    /* =========================
       프론트 전달용
    ========================= */
    public List<Map<String, Object>> getUsers(String roomId) {
        Map<String, UserSessionState> users = rooms.get(roomId);
        if (users == null) return List.of();

        List<Map<String, Object>> result = new ArrayList<>();
        for (UserSessionState u : users.values()) {
            result.add(Map.of(
                    "userId", u.userId,
                    "nickname", u.nickname,
                    "host", u.host
            ));
        }
        return result;
    }
}
