package com.example.drawIt.Domain;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class DrawEvent {

    private String type;      // START, MOVE, END, CLEAR, FILL
    private String userId;

    private float x;
    private float y;

    private String color;
    private float lineWidth;
    private String tool;
}