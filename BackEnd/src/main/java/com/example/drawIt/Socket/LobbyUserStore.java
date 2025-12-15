package com.example.drawIt.Socket;

import com.example.drawIt.DTO.UserResponseDTO;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class LobbyUserStore {

    // roomId -> (sessionId -> UserResponseDTO)
    private final Map<String, Map<String, UserResponseDTO>> lobbyMap = new ConcurrentHashMap<>();

    /* 유저 입장 */
    public synchronized void addUser(String roomId, String sessionId, String nickname) {
        lobbyMap.putIfAbsent(roomId, new ConcurrentHashMap<>());

        Map<String, UserResponseDTO> roomUsers = lobbyMap.get(roomId);

        // 방장이 없으면 첫 입장자를 방장으로
        boolean hasHost = roomUsers.values().stream().anyMatch(UserResponseDTO::isHost);
        boolean isHost = !hasHost;

        roomUsers.put(sessionId, new UserResponseDTO(nickname, isHost));
    }

    /* 유저 퇴장 */
    public synchronized void removeUser(String sessionId) {
        String emptyRoomId = null;

        for (Map.Entry<String, Map<String, UserResponseDTO>> entry : lobbyMap.entrySet()) {
            Map<String, UserResponseDTO> users = entry.getValue();

            if (users.remove(sessionId) != null) {
                // 방장이 나갔다면 새 방장 지정
                users.values().stream().findFirst()
                        .ifPresent(u -> u.setHost(true));
            }

            if (users.isEmpty()) {
                emptyRoomId = entry.getKey();
            }
        }

        // 방에 아무도 없으면 방 삭제
        if (emptyRoomId != null) {
            lobbyMap.remove(emptyRoomId);
        }
    }

    public List<UserResponseDTO> getUsers(String roomId) {
        return new ArrayList<>(lobbyMap.getOrDefault(roomId, Map.of()).values());
    }

    public boolean roomExists(String roomId) {
        return lobbyMap.containsKey(roomId);
    }
}
