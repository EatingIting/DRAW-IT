package com.example.drawIt.Repository;

import com.example.drawIt.Entity.Lobby;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface LobbyRepository extends JpaRepository<Lobby, String> {
    Optional<Lobby> findByName(String name); //방 이름으로 조회 (중복 체크용)
    List<Lobby> findAllByMode(String mode); //게임 모드로 방 목록 조회
    Optional<Lobby> findByNameAndMode(String name, String mode); //이름 + 모드로 방 목록 조회
    boolean existsByName(String name); //방 존재 여부 확인

    List<Lobby> findAllByModeAndNameAndHostUserId(String mode, String name, String hostUserId);
}
