package com.example.drawIt.Domain;

import org.springframework.stereotype.Component;

import java.util.*;

@Component
public class WordProvider {

    private final Random random = new Random();

    /* =========================
       테마별 단어 풀
    ========================= */

    private final Map<String, List<String>> wordPoolByMode = Map.of(
            "RANDOM", List.of(
                    "사람", "아이", "어른", "아기", "할아버지", "할머니",
                    "손", "발", "눈", "코", "입", "귀", "머리",
                    "사과", "바나나", "라면", "치킨",
                    "자동차", "비행기", "자전거",
                    "집", "학교", "병원", "공원",
                    "해", "달", "별", "비", "눈",
                    "책", "연필", "가방",
                    "웃음", "울음", "졸림", "배고픔"
            ),

            "ANIMAL", List.of(
                    "강아지", "고양이", "토끼", "호랑이", "사자", "곰",
                    "말", "소", "돼지", "양", "닭", "오리",
                    "물고기", "상어", "고래", "문어",
                    "거북이", "펭귄", "독수리", "비둘기"
            ),

            "POKEMON", List.of(
                    "피카츄", "라이츄", "파이리", "리자몽",
                    "꼬부기", "거북왕", "이상해씨", "이상해꽃",
                    "이브이", "부스터", "샤미드", "쥬피썬더",
                    "잠만보", "푸린", "고라파덕", "냐옹",
                    "팬텀", "뮤", "뮤츠",
                    "루카리오", "잉어킹", "갸라도스"
            ),

            "FOOD", List.of(
                    "사과", "바나나", "딸기", "수박",
                    "라면", "밥", "김치", "햄버거",
                    "피자", "치킨", "아이스크림", "케이크"
            ),

            "JOB", List.of(
                    "경찰", "소방관", "의사", "간호사",
                    "선생님", "학생", "요리사",
                    "운전기사", "파일럿", "군인", "프로그래머"
            ),

            "SPORT", List.of(
                    "축구", "농구", "야구", "배구",
                    "수영", "달리기", "자전거", "테니스"
            ),

            "OBJECT", List.of(
                    "의자", "책상", "침대", "소파",
                    "컵", "접시", "숟가락", "포크",
                    "가위", "연필", "지우개", "필통",
                    "가방", "시계", "안경", "모자",
                    "우산", "열쇠", "문", "창문",
                    "리모컨", "핸드폰", "텔레비전"
            )
    );

    /* =========================
       모드별 단어 선택 (중복 방지)
    ========================= */
    public String pickUniqueWord(GameState state, String mode) {

        // 1. 모드에 맞는 단어 풀 선택 (없으면 RANDOM)
        List<String> pool =
                wordPoolByMode.getOrDefault(mode, wordPoolByMode.get("RANDOM"));

        Set<String> usedWords = state.getUsedWords();
        List<String> available = new ArrayList<>();

        // 2. 아직 사용되지 않은 단어만 필터
        for (String w : pool) {
            if (!usedWords.contains(w)) {
                available.add(w);
            }
        }

        // 3. 모두 사용했으면 초기화
        if (available.isEmpty()) {
            usedWords.clear();
            available.addAll(pool);
        }

        // 4. 랜덤 선택
        String picked = available.get(random.nextInt(available.size()));
        usedWords.add(picked);

        return picked;
    }
}
