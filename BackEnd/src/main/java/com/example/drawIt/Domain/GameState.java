package com.example.drawIt.Domain;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Getter
@Setter
public class GameState {

//    private String roomId;
    private String drawerUserId;
    private List<DrawEvent> drawEvents = new ArrayList<>();

    public GameState(String drawerUserId) {
        this.drawerUserId = drawerUserId;
    }
}