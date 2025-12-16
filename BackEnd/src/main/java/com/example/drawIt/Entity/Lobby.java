package com.example.drawIt.Entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Lobby {

    @Id
    @Column(length = 20)
    private String id;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(nullable = false, length = 20)
    private String mode;

    @Column(length = 100)
    private String password;

    @Column(nullable = false, length = 50)
    private String hostUserId;
}
