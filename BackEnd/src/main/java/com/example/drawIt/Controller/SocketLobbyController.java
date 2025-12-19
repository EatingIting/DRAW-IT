package com.example.drawIt.Controller;

import com.example.drawIt.DTO.LobbyResponseDTO;
import com.example.drawIt.DTO.SocketJoinDTO;
import com.example.drawIt.Domain.DrawEvent;
import com.example.drawIt.Domain.GameState;
import com.example.drawIt.Domain.GameStateManager;
import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Service.LobbyService;
import com.example.drawIt.Socket.LobbyUserStore;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.util.*;
import java.util.stream.Collectors;

@Controller
@RequiredArgsConstructor
public class SocketLobbyController {

    private final LobbyUserStore lobbyUserStore;
    private final LobbyService lobbyService;
    private final SimpMessagingTemplate messagingTemplate;
    private final GameStateManager gameStateManager;

    /**
     * 📡 [Helper] 대기실 목록(Join 화면) 갱신 알림
     * 방 인원수 변화, 게임 시작 상태 등을 전체 유저에게 알림
     */
    private void broadcastLobbyList() {
        try {
            List<Lobby> lobbies = lobbyService.getAllRooms();
            List<LobbyResponseDTO> dtos = lobbies.stream().map(lobby -> {
                LobbyResponseDTO dto = new LobbyResponseDTO(lobby);
                // 현재 접속자 수 계산
                List<Map<String, Object>> users = lobbyUserStore.getUsers(lobby.getId());
                dto.setCurrentCount((users != null) ? users.size() : 0);
                dto.setMaxCount(10);
                return dto;
            }).collect(Collectors.toList());

            // 구독 중인 모든 유저(/topic/lobbies)에게 전송
            messagingTemplate.convertAndSend("/topic/lobbies", dtos);
        } catch (Exception e) {
            System.err.println("방 목록 갱신 실패: " + e.getMessage());
        }
    }

    /* ============================================================
       🚀 1. 방 입장 (Join)
       - 비밀번호 검증 (방장 제외)
       - 유저 정보 저장 (메모리)
       - 현재 방 상태(게임중, 그림기록 등) 전송
    ============================================================ */
    @MessageMapping("/lobby/{roomId}/join")
    public void join(
            @DestinationVariable String roomId,
            @Payload SocketJoinDTO dto,
            StompHeaderAccessor accessor
    ) {
        try {
            // 1. 방 정보 조회
            Lobby lobby = lobbyService.getLobby(roomId);

            // 2. 비밀번호 검증 (방장은 무조건 프리패스)
            // (방 생성 시의 hostUserId와 현재 접속자의 userId가 같으면 방장)
            boolean isHost = lobby.getHostUserId().equals(dto.getUserId());

            if (!isHost && lobby.getPassword() != null && !lobby.getPassword().isBlank()) {
                if (dto.getPassword() == null || !dto.getPassword().equals(lobby.getPassword())) {
                    System.out.println("⛔ 입장 거부: 비밀번호 불일치 - " + dto.getNickname());
                    return; // 입장 중단
                }
            }

            // 3. 유저 접속 정보 저장 (Session ID 매핑)
            String sessionId = Objects.requireNonNull(accessor.getSessionId());
            lobbyUserStore.addUser(roomId, sessionId, dto.getUserId(), dto.getNickname());

            // 4. 현재 게임 상태 확인
            GameState state = gameStateManager.getGame(roomId);
            boolean gameStarted = (state != null);
            String drawerUserId = (state != null) ? state.getDrawerUserId() : null;

            // 5. 방 안의 유저들에게 "새 유저 입장" 알림
            Map<String, Object> payload = new HashMap<>();
            payload.put("type", "USER_UPDATE");
            payload.put("users", lobbyUserStore.getUsers(roomId));
            payload.put("hostUserId", lobby.getHostUserId());
            payload.put("gameStarted", gameStarted);
            payload.put("drawerUserId", drawerUserId);

            messagingTemplate.convertAndSend("/topic/lobby/" + roomId, payload);

            // 6. 중간 입장 시: 지금까지 그려진 그림(History) 전송
            if (state != null && !state.getDrawEvents().isEmpty()) {
                List<Map<String, Object>> historyPayload = new ArrayList<>();
                for (DrawEvent evt : state.getDrawEvents()) {
                    // 전송 데이터 최소화 및 매핑
                    Map<String, Object> map = new HashMap<>();
                    map.put("type", evt.getType());
                    map.put("x", evt.getX());
                    map.put("y", evt.getY());
                    map.put("color", evt.getColor());
                    map.put("width", evt.getLineWidth());
                    map.put("userId", evt.getUserId());
                    map.put("tool", evt.getTool());
                    historyPayload.add(map);
                }
                // 해당 유저에게만 1:1로 전송
                messagingTemplate.convertAndSend("/topic/history/" + dto.getUserId(), historyPayload);
            }

            // 7. 대기실 목록 갱신 (인원수 변경 반영)
            broadcastLobbyList();

        } catch (IllegalArgumentException e) {
            System.err.println("⚠️ 존재하지 않는 방 접속 시도: " + roomId);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /* ============================================================
       🏁 2. 게임 시작 (Start)
       - DB 상태 변경 (대기중 -> 게임중)
       - 술래(Drawer) 선정 및 게임 초기화
    ============================================================ */
    @MessageMapping("/lobby/{roomId}/start")
    public void startGame(@DestinationVariable String roomId) {
        // 1. DB 상태 업데이트 (중요: Join 화면에 '게임중' 표시 위함)
        lobbyService.updateGameStatus(roomId, true);

        // 2. 현재 접속자 확인
        var users = lobbyUserStore.getUsers(roomId);
        if (users == null || users.isEmpty()) return;

        // 3. 랜덤 술래 선정 및 게임 세션 생성
        String drawerUserId = gameStateManager.pickRandomDrawer(users);
        gameStateManager.createGame(roomId, drawerUserId);

        // 4. 방 안의 유저들에게 게임 시작 알림
        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                Map.of("type", "GAME_START", "drawerUserId", drawerUserId)
        );

        // 5. 대기실 목록 갱신 ('🔥 게임중' 뱃지 표시)
        broadcastLobbyList();
    }

    /* ============================================================
       👋 3. 방 퇴장 (Leave)
       - 유저 목록에서 제거
       - 만약 술래가 나갔다면 술래 변경
    ============================================================ */
    @MessageMapping("/lobby/{roomId}/leave")
    public void leave(@DestinationVariable String roomId, @Payload Map<String, String> payload) {
        String userId = payload.get("userId");

        // 유저 제거
        lobbyUserStore.leaveRoom(roomId, userId);

        // 게임 중 술래가 나갔을 경우 처리
        GameState state = gameStateManager.getGame(roomId);
        if (state != null && userId.equals(state.getDrawerUserId())) {
            var users = lobbyUserStore.getUsers(roomId);
            if (users != null && !users.isEmpty()) {
                // 새 술래 선정
                String newDrawer = gameStateManager.pickRandomDrawer(users);
                state.setDrawerUserId(newDrawer);
                messagingTemplate.convertAndSend(
                        "/topic/lobby/" + roomId,
                        Map.of("type", "DRAWER_CHANGED", "drawerUserId", newDrawer)
                );
            }
        }

        // 남은 유저들에게 퇴장 알림
        messagingTemplate.convertAndSend(
                "/topic/lobby/" + roomId,
                Map.of("type", "USER_UPDATE", "users", lobbyUserStore.getUsers(roomId))
        );

        // 대기실 목록 갱신 (인원수 감소)
        broadcastLobbyList();
    }

    /* ============================================================
       🎨 4. 실시간 그림 그리기 (Draw)
       - 좌표 데이터 브로드캐스팅
       - 서버 메모리에 히스토리 저장
    ============================================================ */
    @MessageMapping("/draw/{roomId}")
    public void handleDraw(@DestinationVariable String roomId, @Payload DrawEvent evt) {
        GameState state = gameStateManager.getGame(roomId);

        // 검증: 게임이 진행 중이고, 보낸 사람이 현재 술래인지 확인
        if (state == null || !evt.getUserId().equals(state.getDrawerUserId())) return;

        // 전체 지우기(CLEAR) 이벤트 처리
        if ("CLEAR".equals(evt.getType())) {
            state.getDrawEvents().clear();
            messagingTemplate.convertAndSend("/topic/lobby/" + roomId + "/draw", Map.of("type", "CLEAR"));
            return;
        }

        // 메모리 보호: 히스토리 너무 길면 초기화 (예외처리)
        if (state.getDrawEvents().size() > 10000) state.getDrawEvents().clear();
        state.getDrawEvents().add(evt);

        // 그리기 데이터 전송
        Map<String, Object> payload = new HashMap<>();
        payload.put("type", evt.getType());
        payload.put("x", evt.getX());
        payload.put("y", evt.getY());
        payload.put("color", evt.getColor());
        payload.put("width", evt.getLineWidth());
        payload.put("tool", evt.getTool());
        payload.put("userId", evt.getUserId());

        messagingTemplate.convertAndSend("/topic/lobby/" + roomId + "/draw", payload);
    }

    /* ============================================================
       🧹 5. 캔버스 초기화 (Clear)
       - 술래가 휴지통 버튼 눌렀을 때
    ============================================================ */
    @MessageMapping("/draw/{roomId}/clear")
    public void clear(@DestinationVariable String roomId, @Payload Map<String, Object> payload) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null) return;

        // 술래인지 재확인
        if (!payload.get("userId").toString().equals(state.getDrawerUserId())) return;

        state.getDrawEvents().clear();
        messagingTemplate.convertAndSend("/topic/lobby/" + roomId + "/draw", Map.of("type", "CLEAR"));
    }

    /* ============================================================
       📚 6. 그림 히스토리 요청 (History)
       - (사용 안 함: Join 시 자동으로 보내므로 필요 시 삭제 가능)
    ============================================================ */
    @MessageMapping("/draw/{roomId}/history")
    public void sendHistory(@DestinationVariable String roomId, StompHeaderAccessor accessor) {
        GameState state = gameStateManager.getGame(roomId);
        if (state == null || state.getDrawEvents().isEmpty()) return;

        String sessionId = Objects.requireNonNull(accessor.getSessionId());
        List<Map<String, Object>> historyPayload = new ArrayList<>();

        for (DrawEvent evt : state.getDrawEvents()) {
            Map<String, Object> map = new HashMap<>();
            map.put("type", evt.getType());
            map.put("x", evt.getX());
            map.put("y", evt.getY());
            map.put("color", evt.getColor());
            map.put("width", evt.getLineWidth());
            map.put("userId", evt.getUserId());
            historyPayload.add(map);
        }
        messagingTemplate.convertAndSendToUser(sessionId, "/queue/draw/history", historyPayload);
    }
}