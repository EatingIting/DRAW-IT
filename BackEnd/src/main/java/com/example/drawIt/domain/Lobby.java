package com.example.drawIt.domain;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class Lobby {

    private Long id;
    private String name;
    private String mode;
    private String password;
}
