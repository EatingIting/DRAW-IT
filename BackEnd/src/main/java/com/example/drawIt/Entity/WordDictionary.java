package com.example.drawIt.Entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "word_dictionary")
@Getter
@NoArgsConstructor
public class WordDictionary {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String word;

    @Column(name = "first_char", nullable = false, length = 1)
    private String firstChar;

    @Column(name = "last_char", nullable = false, length = 1)
    private String lastChar;

    @Column(nullable = false)
    private boolean used;

    public void markUsed() {
        this.used = true;
    }
}
