package com.example.drawIt.Controller;

import com.example.drawIt.DTO.CreateLobbyDTO;
import com.example.drawIt.DTO.LobbyResponseDTO;
import com.example.drawIt.DTO.UpdateLobbyDTO;
import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Service.LobbyService;
import com.example.drawIt.Socket.LobbyUserStore;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class LobbyController {

    private final LobbyService lobbyService;
    private final SimpMessagingTemplate messagingTemplate;
    private final LobbyUserStore lobbyUserStore;

    // 방 목록 갱신 알림
    private void broadcastLobbyList() {
        List<Lobby> lobbies = lobbyService.getAllRooms();
        List<LobbyResponseDTO> dtos = lobbies.stream().map(lobby -> {
            LobbyResponseDTO dto = new LobbyResponseDTO(lobby);
            List<Map<String, Object>> users = lobbyUserStore.getUsers(lobby.getId());
            dto.setCurrentCount((users != null) ? users.size() : 0);
            dto.setMaxCount(10);
            return dto;
        }).collect(Collectors.toList());
        messagingTemplate.convertAndSend("/topic/lobbies", dtos);
    }

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
        // 유효성 검사 생략 (기존 유지)
        Lobby lobby = lobbyService.createLobby(dto);
        broadcastLobbyList(); // 목록 갱신
        return ResponseEntity.status(HttpStatus.CREATED).body(new LobbyResponseDTO(lobby));
    }

    // 🔥 [핵심 수정] 리턴 타입과 변수가 올바르게 수정됨
    @GetMapping("/lobby/{lobbyId}")
    public ResponseEntity<Map<String, Object>> getLobby(@PathVariable String lobbyId) {
        Lobby lobby = lobbyService.getLobby(lobbyId);

        // 접속자 목록 가져오기
        List<Map<String, Object>> users = lobbyUserStore.getUsers(lobbyId);

        // 응답 맵 생성
        Map<String, Object> response = new HashMap<>();

        // 로비 정보 넣기
        LobbyResponseDTO dto = new LobbyResponseDTO(lobby);
        dto.setCurrentCount(users != null ? users.size() : 0);
        dto.setMaxCount(10);
        response.put("lobby", dto);

        // 유저 목록 넣기 (null이면 빈 리스트)
        response.put("users", users != null ? users : new ArrayList<>());

        // 🚨 중요: dto가 아니라 'response' 맵을 리턴해야 함!
        return ResponseEntity.ok(response);
    }

    

    @GetMapping("/api/lobbies")
    public List<LobbyResponseDTO> getLobbyList() {
        return lobbyService.getAllRooms().stream().map(lobby -> {
            LobbyResponseDTO dto = new LobbyResponseDTO(lobby);
            List<Map<String, Object>> users = lobbyUserStore.getUsers(lobby.getId());
            dto.setCurrentCount((users != null) ? users.size() : 0);
            dto.setMaxCount(10);
            return dto;
        }).collect(Collectors.toList());
    }

    // updateLobby 등 나머지는 기존과 동일
    @PutMapping("/lobby/{lobbyId}")
    public ResponseEntity<LobbyResponseDTO> updateLobby(@PathVariable String lobbyId, @RequestBody UpdateLobbyDTO dto) {
        Lobby updated = lobbyService.updateLobby(lobbyId, dto);
        broadcastLobbyList();
        return ResponseEntity.ok(new LobbyResponseDTO(updated));
    }
}