package com.example.drawIt.Entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Lobby {

    @Id
    @Column(length = 20)
    private String id;

    @Column(nullable = false, length = 50, unique = true)
    private String name;

    @Column(nullable = false, length = 20)
    private String mode;

    @Column(length = 100)
    private String password;

    @Column(nullable = false, length = 50)
    private String hostUserId;

    @Column(nullable = false, length = 100)
    private String hostNickname;

    @Column(nullable = false)
    private boolean gameStarted;

    @Column(nullable = false)
    private LocalDateTime createdAt;

}
