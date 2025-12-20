package com.example.drawIt.Repository;

import com.example.drawIt.Entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    /* =========================
       userId 기반 조회 (핵심)
    ========================= */

    // 특정 방에서 특정 유저 (재접속 판단용)
    Optional<User> findByRoomIdAndUserId(String roomId, String userId);

    // session disconnect 시 세션만 끊기
    Optional<User> findBySessionId(String sessionId);

    /* =========================
       방 단위 조회
    ========================= */

    List<User> findByRoomId(String roomId);

    long countByRoomId(String roomId);

    /* =========================
       삭제 계열
    ========================= */

    // 진짜 방 나가기 / 방 삭제 시
    void deleteByRoomIdAndUserId(String roomId, String userId);

    void deleteByRoomId(String roomId);
}
