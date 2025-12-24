package com.example.drawIt.Controller;

import com.example.drawIt.DTO.CreateLobbyDTO;
import com.example.drawIt.DTO.LobbyResponseDTO;
import com.example.drawIt.DTO.UpdateLobbyDTO;
import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Repository.LobbyRepository;
import com.example.drawIt.Repository.UserRepository;
import com.example.drawIt.Service.LobbyService;
import com.example.drawIt.Socket.LobbyUserStore;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class LobbyController {

    private final LobbyService lobbyService;
    private final SimpMessagingTemplate messagingTemplate;
    private final LobbyUserStore lobbyUserStore;
    private final LobbyRepository lobbyRepository;

    // 방 목록 갱신 알림
    private List<LobbyResponseDTO> buildValidLobbyList() {

        List<LobbyResponseDTO> result = new ArrayList<>();

        List<Lobby> lobbies = lobbyService.getAllRooms();
        if (lobbies == null) {
            return result;
        }

        for (Lobby lobby : lobbies) {

            List<Map<String, Object>> users = lobbyUserStore.getUsers(lobby.getId());
            int currentCount = (users != null) ? users.size() : 0;

            // 0명 방 제거
            if (currentCount <= 0) {
                continue;
            }

            // 게임 중인데 2명 미만 → 제거
            if (lobby.isGameStarted() && currentCount < 2) {
                continue;
            }

            // 정상 방만 DTO 생성
            LobbyResponseDTO dto = new LobbyResponseDTO(lobby);
            dto.setCurrentCount(currentCount);
            dto.setMaxCount(10);

            result.add(dto);
        }

        return result;
    }

    /* ============================================================
       WebSocket: 방 목록 브로드캐스트
    ============================================================ */

    // 비밀번호 검증 API
    @PostMapping("/lobby/verify")
    public ResponseEntity<?> verifyPassword(@RequestBody Map<String, String> payload) {
        String roomId = payload.get("roomId");
        String password = payload.get("password");
        Lobby lobby = lobbyService.getLobby(roomId);

        if (lobby == null) return ResponseEntity.badRequest().body("존재하지 않는 방");

        if (lobby.getPassword() != null && !lobby.getPassword().isBlank()) {
            if (password == null || !password.equals(lobby.getPassword())) {
                return ResponseEntity.status(401).body("비밀번호 불일치");
            }
        }
        return ResponseEntity.ok().body("확인 완료");
    }

    @PostMapping("/lobby")
    public ResponseEntity<LobbyResponseDTO> createLobby(@RequestBody CreateLobbyDTO dto) {

        // 1. 방 생성
        Lobby lobby = lobbyService.createLobby(dto);
        // 2. 🔥 방장 즉시 입장 처리 (sessionId는 가짜 값)
        lobbyUserStore.addUser(
                lobby.getId(),
                "INIT-" + dto.getHostUserId(), // 임시 세션 ID
                dto.getHostUserId(),
                dto.getHostNickname()
        );

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(new LobbyResponseDTO(lobby));
    }

    // 🔥 [핵심 수정] 리턴 타입과 변수가 올바르게 수정됨
    @GetMapping("/lobby/{lobbyId}")
    public ResponseEntity<Map<String, Object>> getLobby(@PathVariable String lobbyId) {

        Lobby lobby = lobbyService.getLobby(lobbyId);
        List<Map<String, Object>> users = lobbyUserStore.getUsers(lobbyId);

        Map<String, Object> response = new HashMap<>();

        LobbyResponseDTO dto = new LobbyResponseDTO(lobby);
        dto.setCurrentCount(users != null ? users.size() : 0);
        dto.setMaxCount(10);

        response.put("lobby", dto);
        response.put("users", users != null ? users : List.of());

        return ResponseEntity.ok(response);
    }

    @GetMapping("/api/lobbies")
    public List<LobbyResponseDTO> getLobbyList() {
        return buildValidLobbyList();
    }

    // updateLobby 등 나머지는 기존과 동일
    @PutMapping("/lobby/{lobbyId}")
    public ResponseEntity<LobbyResponseDTO> updateLobby(@PathVariable String lobbyId, @RequestBody UpdateLobbyDTO dto) {
        Lobby updated = lobbyService.updateLobby(lobbyId, dto);

        List<LobbyResponseDTO> currentLobbyList = buildValidLobbyList();
        messagingTemplate.convertAndSend("/topic/lobbies", currentLobbyList);
        
        return ResponseEntity.ok(new LobbyResponseDTO(updated));
    }
}