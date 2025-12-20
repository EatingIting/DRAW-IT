package com.example.drawIt.Domain;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.util.List;

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

    private List<Point> points;

    @Getter
    @Setter
    @NoArgsConstructor
    public static class Point {
        private float x;
        private float y;
    }
}