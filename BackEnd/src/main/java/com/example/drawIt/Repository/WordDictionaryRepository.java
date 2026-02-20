package com.example.drawIt.Repository;

import com.example.drawIt.Entity.WordDictionary;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

public interface WordDictionaryRepository extends JpaRepository<WordDictionary, Long> {

    @Query(value = """
        SELECT *
        FROM word_dictionary
        WHERE first_char = :firstChar
          AND used = false
        ORDER BY RAND()
        LIMIT 1
    """, nativeQuery = true)
    Optional<WordDictionary> findRandomByFirstChar(@Param("firstChar") String firstChar);

    @Query(value = """
        SELECT *
        FROM word_dictionary
        WHERE first_char = :firstChar
        ORDER BY RAND()
        LIMIT 1
    """, nativeQuery = true)
    Optional<WordDictionary> findAnyRandomByFirstChar(@Param("firstChar") String firstChar);

    @Modifying
    @Transactional
    @Query(value = "UPDATE word_dictionary SET used = false", nativeQuery = true)
    int resetAllUsedFlags();

    boolean existsByWord(String word);

}
