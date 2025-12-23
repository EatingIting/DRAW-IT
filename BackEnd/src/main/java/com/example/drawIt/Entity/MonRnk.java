package com.example.drawIt.Entity;

import jakarta.persistence.*;
import lombok.*;

import java.util.Date;

@Entity
@Table(name="MonthlyRanking")
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@ToString
@Builder
public class MonRnk {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private long imgId;
    @Column(nullable=false, length=200, unique=true)
    private String imgName;
    @Column(nullable=false, length=200)
    private String imgUrl; // C:\MonthlyRank\{month}\{fileName}
    @Column(nullable=false, length=50)
    private String topic;
    @Column(nullable=false)
    private long recommend;
    @Column(nullable=false)
    private Date regDate;
}
