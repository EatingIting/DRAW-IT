package com.example.drawIt.Controller;

import com.example.drawIt.DTO.SocketJoinDTO;
import com.example.drawIt.Domain.DrawEvent;
import com.example.drawIt.Domain.GameState;
import com.example.drawIt.Domain.GameStateManager;
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

@Controller
@RequiredArgsConstructor
public class SocketController {

    private final LobbyUserStore lobbyUserStore;
    private final LobbyService lobbyService;
    private final SimpMessagingTemplate messagingTemplate;
    private final GameStateManager gameStateManager;
    private final GameImageService gameImageService;
    private final MonRnkService monRnkService;

    private static final int ROUND_DURATION_SECONDS = 60;

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    private final Set<String> endingLobbies = ConcurrentHashMap.newKeySet();

    @MessageMapping("/lobby/{roomId}/join")
    public void join(@DestinationVariable String roomId, @Payload SocketJoinDTO dto, StompHeaderAccessor accessor) {
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
        if(gameStarted && currentWord != null) payload.put("word", currentWord);

        // 중간 입장 시 타이머 동기화
        if (gameStarted) {
            long endTime = state.getRoundEndTime();
            payload.put("roundEndTime", endTime);
            payload.put("serverNow", System.currentTimeMillis());
        }

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, payload);

        // 히스토리 전송 로직 (생략 없이 기존과 동일하게 유지)
        if (state != null && !state.getDrawEvents().isEmpty()) {
            Map<String, Object> historyPayload = new HashMap<>();
            List<Map<String, Object>> activeHistory = new ArrayList<>();

            for (DrawEvent evt : state.getDrawEvents())
                activeHistory.add(convertEventToMap(evt));

            historyPayload.put("history", activeHistory);
            List<Map<String, Object>> redoHistory = new ArrayList<>();

            for (DrawEvent evt : state.getRedoStack())
                redoHistory.add(convertEventToMap(evt));

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
    public void startGame(@DestinationVariable String roomId) {
        var users = lobbyUserStore.getUsers(roomId);

        if(users == null || users.size() < 2) {
            messagingTemplate.convertAndSend("/topic/lobby/" + roomId,
                    Map.of(
                            "type", "GAME_START_DENIED",
                            "reason", "NOT_ENOUGH_PLAYERS"
                    )
            );
            return;
        }

        lobbyService.markGameStarted(roomId);

        Lobby lobby = lobbyService.getLobby(roomId);
        String mode = lobby.getMode();

        String drawerUserId = gameStateManager.pickRandomDrawer(users);
        GameState state = gameStateManager.createGame(roomId, drawerUserId, mode, ROUND_DURATION_SECONDS);

        state.setRoundEndTime(0L);

        // createGame 안에서 roundEndTime이 설정되므로, 여기서 get 해서 보냄
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "GAME_START",
                "drawerUserId", drawerUserId,
                "word", state.getCurrentWord(),
                "gameStarted", true,
                "roundEndTime", 0L,
                "serverNow", System.currentTimeMillis()
        ));

        scheduler.schedule(new Runnable() {
            @Override
            public void run() {
                startRealGame(roomId);
            }
        }, 3, TimeUnit.SECONDS);
    }

    @MessageMapping("/lobby/{roomId}/nickname")
    public void changeNickname(@DestinationVariable String roomId,
                               @Payload Map<String, String> payload) {
        String userId = payload.get("userId");
        String nickname = payload.get("nickname");

        lobbyUserStore.changeNickname(roomId, userId, nickname);
    }

    @MessageMapping("/lobby/{roomId}/leave")
    public void leave(@DestinationVariable String roomId,
                      @Payload Map<String, String> payload) {
        lobbyUserStore.leaveRoom(roomId, payload.get("userId"));
    }

    @MessageMapping("/draw/{roomId}")
    public void handleDraw(@DestinationVariable String roomId, @Payload DrawEvent evt) {
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
            case "FILL": case "CLEAR":
                state.getDrawEvents().add(evt);
                state.getRedoStack().clear();
                break;
            case "UNDO":
                if (!state.getDrawEvents().isEmpty()) state.getRedoStack().push(state.getDrawEvents().remove(state.getDrawEvents().size()-1));
                break;
            case "REDO":
                if (!state.getRedoStack().isEmpty()) state.getDrawEvents().add(state.getRedoStack().pop());
                break;
        }
        if (state.getDrawEvents().size() > 5000) state.getDrawEvents().remove(0);
    }

    @MessageMapping("/draw/{roomId}/clear")
    public void clear(@DestinationVariable String roomId, @Payload Map<String, Object> payload) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;
        Object userIdObj = payload.get("userId");
        if (userIdObj == null || !userIdObj.toString().equals(state.getDrawerUserId())) return;
        DrawEvent clearEvent = new DrawEvent();
        clearEvent.setType("CLEAR");
        clearEvent.setUserId(userIdObj.toString());
        state.getDrawEvents().add(clearEvent);
        state.getRedoStack().clear();
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId + "/draw", Map.of("type", "CLEAR", "userId", userIdObj));
    }

    @MessageMapping("/chat/bubble")
    public void chatBubble(@Payload Map<String, Object> payload) {
        String roomId = (String) payload.get("lobbyId");
        String userId = (String) payload.get("userId");
        String message = (String) payload.get("message");

        // 1. 일반 채팅 전송
        messagingTemplate.convertAndSend(
                "/topic/chat/bubble",
                Map.of("type", "CHAT_BUBBLE", "userId", userId, "message", message)
        );

        // 2. 정답 체크
        GameState state = gameStateManager.getGame(roomId);
        if (state != null && message.trim().equals(state.getCurrentWord())) {

            // 출제자가 본인 답을 말하는 건 무시
            if(userId.equals(state.getDrawerUserId())) return;

            // 정답자의 닉네임 조회
            String winnerNickname = lobbyUserStore.getUsers(roomId).stream()
                    .filter(u -> u.get("userId").equals(userId))
                    .map(u -> (String) u.get("nickname"))
                    .findFirst()
                    .orElse("(알수없음)");

            System.out.println("🎉 정답자 발생! User: " + winnerNickname);

            lobbyUserStore.addScore(roomId, userId, 10);

            if(state.getDrawerUserId() != null) { //출제자가 방에 남아있을 경우
                lobbyUserStore.addScore(roomId, state.getDrawerUserId(), 5);
            }

            messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                    "type", "USER_UPDATE",
                    "users", lobbyUserStore.getUsers(roomId), // 갱신된 점수 포함
                    "gameStarted", true
            ));

            // 1) 모든 유저에게 정답자 알림 (닉네임 포함)
            messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                    "type", "CORRECT_ANSWER",
                    "winnerUserId", userId,
                    "winnerNickname", winnerNickname, // 닉네임 추가 전송
                    "answer", state.getCurrentWord()
            ));

            // 2) 4초 뒤에 다음 라운드 진행
            scheduler.schedule(() -> {
                processNextRound(roomId);
            }, 4, TimeUnit.SECONDS);
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

        // 라운드 증가
        int nextRound = state.getCurrentRound() + 1;

        // 10라운드 종료 체크
        if (nextRound > GameState.MAX_ROUND) {

            // 🔥 [핵심 수정] 이미 종료 예약된 방이면 무시 (중복 실행 방지)
            if (endingLobbies.contains(roomId)) {
                return;
            }
            endingLobbies.add(roomId); // "이 방은 이제 종료됩니다" 표시

            // 클라이언트에 게임 종료 알림
            messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                    "type", "GAME_OVER",
                    "totalRounds", GameState.MAX_ROUND
            ));

            System.out.println("🗳️ [Server] 게임 종료! 투표 대기 시작 (60초): " + roomId);

            // 30초 뒤 저장 로직 단 한 번만 실행
            scheduler.schedule(() -> {
                finishVoteAndSave(roomId);
            }, 30, TimeUnit.SECONDS);

            return;
        }
        state.setCurrentRound(nextRound);

        // 새 출제자 선정 (10라운드 규칙 적용)
        String newDrawer = gameStateManager.pickNextDrawer(state, users);
        state.setDrawerUserId(newDrawer);

        String newWord = gameStateManager.pickNextWord(state);
        state.setCurrentWord(newWord);

        // 새 라운드 시작 시, 이정 그림 히스토리 삭제
        // 이걸 안 하면 데이터가 계속 쌓여서 나중에 렉 걸리고 튕김
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

        // 3. 3초 뒤에 "진짜 시작" 신호 예약
        scheduler.schedule(new Runnable() {
            @Override
            public void run() {
                startRealGame(roomId);
            }
        }, 3, TimeUnit.SECONDS);
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

        // 현재 라운드 번호를 기억해둠
        final int currentRound = state.getCurrentRound();

        // 60초 뒤에 실행될 때, 이 라운드 번호를 들고 감.
        scheduler.schedule(new Runnable() {
            @Override
            public void run() {
                checkAndTimeOver(roomId, currentRound);
            }
        }, durationMs, TimeUnit.MILLISECONDS);
    }

    private void checkAndTimeOver(String roomId, int scheduledRound) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;

        if (state.getCurrentRound() != scheduledRound) {
            return;
        }

        System.out.println("시간 초과! (Room: " + roomId + ")");

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId, Map.of(
                "type", "TIME_OVER"
        ));

        // 3초 뒤에 다음 라운드로 넘어가도록 스케줄링
        scheduler.schedule(() -> {
            // 3초 뒤에 실제로 다음 라운드 진행
            // (혹시 그 사이 방이 폭파됐거나 상태 변했을 수 있으니 체크)
            GameState currentState = gameStateManager.getGame(roomId);
            if (currentState != null && currentState.getCurrentRound() == scheduledRound) {
                processNextRound(roomId);
            }
        }, 3, TimeUnit.SECONDS);
    }

    private synchronized void finishVoteAndSave(String roomId) {
        // 방이 이미 삭제되었거나 처리가 끝났는지 확인
        if (lobbyUserStore.getUsers(roomId).isEmpty()) return;

        System.out.println("🏆 [Server] 투표 종료 로직 실행: " + roomId);

        try {
            // 1. 우승자 선별 (수정된 메서드 사용)
            List<Map<String, String>> winners = gameImageService.getWinners(roomId);

            // 2. 우승자가 있을 경우에만 월간 랭킹에 저장
            if (!winners.isEmpty()) {
                monRnkService.saveWinners(winners);
                System.out.println("💾 월간 랭킹 저장 완료: " + winners.size() + "건");
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            // 정리 작업
            gameImageService.clearRoomData(roomId);
            gameStateManager.removeGame(roomId);

            // 🔥 [추가] 종료 리스트에서 방 제거
            endingLobbies.remove(roomId);

            System.out.println("🧹 방 폭파 완료: " + roomId);
        }
    }

    @MessageMapping("/vote/{lobbyId}")
    public void handleVote(@DestinationVariable String lobbyId, @Payload Map<String, Object> payload) {
        try {
            // 1. 데이터 추출
            Integer voteIndex = (Integer) payload.get("voteIndex");
            String userId = (String) payload.get("userId");

            System.out.println("[Controller] 투표 요청: Lobby=" + lobbyId + ", Idx=" + voteIndex + ", User=" + userId);

            // 2. 서비스 호출 (투표 반영 및 최신 카운트 리스트 획득)
            // "투표 증가" 로그는 여기서 찍힘
            List<Integer> latestVoteCounts = gameImageService.addVote(lobbyId, voteIndex, userId);

            // 3. 갱신된 투표 현황을 모든 클라이언트에게 방송
            // 이 부분이 없으면 프론트엔드에서 엄지척이 절대 안 뜹니다.
            messagingTemplate.convertAndSend("/topic/vote/" + lobbyId, latestVoteCounts);

            System.out.println("[Controller] 투표 현황 방송 완료: " + latestVoteCounts);

        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}