package com.example.drawIt.Socket;

import com.example.drawIt.Domain.GameState;
import com.example.drawIt.Domain.GameStateManager;
import com.example.drawIt.Entity.Lobby;
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
    private void broadcastLobbyList() {

        List<Lobby> lobbies = lobbyRepository.findAll();
        List<Map<String, Object>> result = new ArrayList<>();

        for (Lobby lobby : lobbies) {

            Map<String, UserSessionState> users = rooms.get(lobby.getId());
            int count = (users != null) ? users.size() : 0;

            // 0명 방 제외
            if (count <= 0) continue;

            // 게임 중인데 2명 미만이면 제외
            if (lobby.isGameStarted() && count < 2) continue;

            Map<String, Object> dto = new HashMap<>();
            dto.put("id", lobby.getId());
            dto.put("name", lobby.getName());
            dto.put("mode", lobby.getMode());
            dto.put("hostNickname", lobby.getHostNickname());
            dto.put("gameStarted", lobby.isGameStarted());
            dto.put("currentCount", count);
            dto.put("maxCount", 10);
            dto.put(
                    "passwordEnabled",
                    lobby.getPassword() != null && !lobby.getPassword().isBlank()
            );

            result.add(dto);
        }

        messagingTemplate.convertAndSend("/topic/lobbies", result);
    }

    @Transactional
    public synchronized void addUser(String roomId, String sessionId, String userId, String nickname) {

        rooms.putIfAbsent(roomId, new ConcurrentHashMap<>());
        Map<String, UserSessionState> users = rooms.get(roomId);

        UserSessionState state = users.get(userId);

        if (state == null) {
            boolean isFirst = users.isEmpty();
            String resolvedNickname = resolveDuplicateNickname(roomId, nickname);
            state = new UserSessionState(userId, resolvedNickname, isFirst);
            users.put(userId, state);

            if (isFirst) {
                lobbyRepository.updateHost(roomId, userId, resolvedNickname);
            }
        } else {
            state.setDisconnectAt(0);

            String resolvedNickname = resolveDuplicateNickname(roomId, nickname);
        }

        state.setSessionId(sessionId);
        sessionIndex.put(sessionId, new String[]{roomId, userId});

        broadcastLobbyList();
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
        broadcastLobbyList();
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
    /*
        닉네임 중복(2), (3)
    */
    private String resolveDuplicateNickname(String roomId, String requestedNickname) {

        Map<String, UserSessionState> users = rooms.get(roomId);
        if (users == null || users.isEmpty()) {
            return requestedNickname;
        }

        // 현재 사용 중인 닉네임 목록
        Set<String> usedNicknames = users.values().stream()
                .map(UserSessionState::getNickname)
                .collect(Collectors.toSet());

        // 그대로 사용 가능하면 OK
        if (!usedNicknames.contains(requestedNickname)) {
            return requestedNickname;
        }

        // (2), (3), (4) ...
        int index = 2;
        while (true) {
            String candidate = requestedNickname + "(" + index + ")";
            if (!usedNicknames.contains(candidate)) {
                return candidate;
            }
            index++;
        }
    }

    /*
        닉네임 변경
    */
    @Transactional
    public synchronized String changeNickname(
            String roomId,
            String userId,
            String newNickname
    ) {
        Map<String, UserSessionState> users = rooms.get(roomId);
        if (users == null) return null;

        UserSessionState state = users.get(userId);
        if (state == null) return null;

        // 🔥 중복 처리 (기존 유저들 기준, 자기 자신 제외)
        Set<String> usedNicknames = users.values().stream()
                .filter(u -> !u.getUserId().equals(userId))
                .map(UserSessionState::getNickname)
                .collect(Collectors.toSet());

        String resolved = newNickname;
        if (usedNicknames.contains(newNickname)) {
            int index = 2;
            while (true) {
                String candidate = newNickname + "(" + index + ")";
                if (!usedNicknames.contains(candidate)) {
                    resolved = candidate;
                    break;
                }
                index++;
            }
        }

        state.setNickname(resolved);

        // 방장인 경우 DB도 갱신
        if (state.isHost()) {
            lobbyRepository.updateHost(roomId, userId, resolved);
        }

        // 🔥 로비에 유저 목록 갱신 알림
        sendUserUpdate(roomId);

        return resolved;
    }

    /* =========================
       유저 제거 후 처리
    ========================= */
    private void processUserRemoval(String roomId, Map<String, UserSessionState> users, UserSessionState removed) {

        Lobby lobby = lobbyRepository.findById(roomId).orElse(null);

        if (lobby != null && lobby.isGameStarted() && users.size() < 2) {
            System.out.println("🔥 [Server] 게임 중 인원 부족 → 방 삭제: " + roomId);
            // 게임 상태 제거
            gameStateManager.removeGame(roomId);
            // DB 방 삭제
            lobbyRepository.deleteById(roomId);
            // 메모리 정리
            rooms.remove(roomId);
            return;
        }

        if (users.isEmpty()) {
            if (lobby != null) {
                // 대기 중 방만 실제 삭제
                    lobbyRepository.deleteById(roomId);
                    System.out.println("[Server] 대기 중 0명 방 삭제: " + roomId);
            }
            rooms.remove(roomId);
            gameStateManager.removeGame(roomId);
            return;
        }

        if (removed != null && removed.isHost()) {
            UserSessionState next = users.values().iterator().next();
            next.setHost(true);
            lobbyRepository.updateHost(
                    roomId,
                    next.getUserId(),
                    next.getNickname()
            );
        }

        handleGameLogicOnRemoval(
                roomId,
                removed != null ? removed.getUserId() : null
        );
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

        // ★ 방 정보를 조회해서 현재 방장 ID를 가져옴
        Lobby lobby = lobbyRepository.findById(roomId).orElse(null);
        String hostUserId = (lobby != null) ? lobby.getHostUserId() : null;

        Map<String, Object> payload = new HashMap<>();
        payload.put("type", "USER_UPDATE");
        payload.put("users", getUsers(roomId));
        payload.put("gameStarted", state != null);

        // ★ 메시지에 hostUserId 포함
        if (hostUserId != null) {
            payload.put("hostUserId", hostUserId);
        }

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, payload);
    }

    public synchronized void updateProfile(String roomId, String userId, String newNickname, Object newProfileImage) {
        Map<String, UserSessionState> users = rooms.get(roomId);
        if (users == null) return;

        UserSessionState user = users.get(userId);
        if (user != null) {
            // 닉네임 중복 처리 (본인 닉네임이면 스킵)
            if (!user.getNickname().equals(newNickname)) {
                String resolved = resolveDuplicateNickname(roomId, newNickname);
                user.setNickname(resolved);
            }
            // 프로필 이미지 업데이트
            if (newProfileImage != null) {
                user.setProfileImage(newProfileImage);
            }

            // 변경 사항 즉시 방송
            sendUserUpdate(roomId);
        }
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
                        "score", u.getScore(),
                        "profileImage", u.getProfileImage() != null ? u.getProfileImage() : "default" // ★ 추가됨
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

    public synchronized void removeRoom(String roomId) {
        rooms.remove(roomId);
        gameStateManager.removeGame(roomId);
    }
}
