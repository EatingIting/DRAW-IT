package com.example.drawIt.Repository;

import com.example.drawIt.Entity.Lobby;
import jakarta.transaction.Transactional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface LobbyRepository extends JpaRepository<Lobby, String> {
    Optional<Lobby> findByName(String name); //방 이름으로 조회 (중복 체크용)
    List<Lobby> findAllByMode(String mode); //게임 모드로 방 목록 조회
    Optional<Lobby> findByNameAndMode(String name, String mode); //이름 + 모드로 방 목록 조회
    boolean existsByName(String name); //방 존재 여부 확인

    List<Lobby> findAllByModeAndNameAndHostUserId(String mode, String name, String hostUserId);

    @Modifying
    @Transactional
    @Query("""
    update Lobby l
    set l.hostUserId = :userId,
        l.hostNickname = :nickname
    where l.id = :roomId
""")
    void updateHost(
            @Param("roomId") String roomId,
            @Param("userId") String userId,
            @Param("nickname") String nickname
    );
}
