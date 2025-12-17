package com.example.drawIt.Domain;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Stack;
import java.util.concurrent.CopyOnWriteArrayList;

@Getter
@Setter
public class GameState {

    private String drawerUserId;
    private List<DrawEvent> drawEvents = new CopyOnWriteArrayList<>();

    private Stack<DrawEvent> redoStack = new Stack<>();

    public GameState(String drawerUserId) {
        this.drawerUserId = drawerUserId;
    }
}