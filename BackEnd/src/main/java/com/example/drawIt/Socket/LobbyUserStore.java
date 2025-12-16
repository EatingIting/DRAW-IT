package com.example.drawIt.Socket;

import com.example.drawIt.DTO.UserResponseDTO;
import com.example.drawIt.Entity.Lobby;
import com.example.drawIt.Entity.User;
import com.example.drawIt.Repository.LobbyRepository;
import com.example.drawIt.Repository.UserRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
@RequiredArgsConstructor
public class LobbyUserStore {

    private final UserRepository userRepository;
    private final LobbyRepository lobbyRepository;

    // roomId → userId → UserResponseDTO
    private final Map<String, Map<String, UserResponseDTO>> store = new ConcurrentHashMap<>();

    /* =========================
       유저 입장 / 재접속
    ========================= */
    @Transactional
    public synchronized void addUser(
            String roomId,
            String sessionId,
            String userId,
            String nickname
    ) {

        store.putIfAbsent(roomId, new ConcurrentHashMap<>());
        Map<String, UserResponseDTO> users = store.get(roomId);

        Lobby lobby = lobbyRepository.findById(roomId)
                .orElseThrow(() -> new IllegalStateException("방 없음"));

        boolean isHost = userId.equals(lobby.getHostUserId());

        // ✅ 이미 존재하는 userId면 "재접속"
        UserResponseDTO dto = users.get(userId);
        if (dto == null) {
            dto = new UserResponseDTO(userId, nickname, isHost);
            users.put(userId, dto);
        } else {
            dto.setNickname(nickname);
        }

        // DB 업데이트
        userRepository.findByRoomIdAndUserId(roomId, userId)
                .ifPresentOrElse(
                        u -> {
                            u.setSessionId(sessionId);
                            u.setNickname(nickname);
                            u.setHost(isHost);
                            userRepository.save(u);
                        },
                        () -> userRepository.save(
                                User.builder()
                                        .roomId(roomId)
                                        .userId(userId)
                                        .sessionId(sessionId)
                                        .nickname(nickname)
                                        .host(isHost)
                                        .build()
                        )
                );
    }

    /* =========================
       유저 연결 해제 (즉시 삭제 ❌)
    ========================= */
    public synchronized void removeSession(String sessionId) {
        userRepository.findBySessionId(sessionId)
                .ifPresent(u -> {
                    // ❌ store/DB에서 제거하지 않음
                    // → 재접속 가능
                    u.setSessionId(null);
                    userRepository.save(u);
                });
    }

    /* =========================
       진짜 방 나가기 (버튼)
    ========================= */
    @Transactional
    public synchronized void leaveRoom(String roomId, String userId) {

        Map<String, UserResponseDTO> users = store.get(roomId);
        if (users == null) return;

        UserResponseDTO removed = users.remove(userId);
        userRepository.deleteByRoomIdAndUserId(roomId, userId);

        if (removed != null && removed.isHost() && !users.isEmpty()) {
            // 방장 위임
            UserResponseDTO next = users.values().iterator().next();
            next.setHost(true);

            lobbyRepository.findById(roomId).ifPresent(lobby -> {
                lobbyRepository.save(
                        Lobby.builder()
                                .id(lobby.getId())
                                .name(lobby.getName())
                                .mode(lobby.getMode())
                                .password(lobby.getPassword())
                                .hostUserId(next.getUserId())
                                .build()
                );
            });
        }

        if (users.isEmpty()) {
            store.remove(roomId);
            lobbyRepository.deleteById(roomId);
            userRepository.deleteByRoomId(roomId);
        }
    }

    public List<UserResponseDTO> getUsers(String roomId) {
        return new ArrayList<>(store.getOrDefault(roomId, Map.of()).values());
    }
}
