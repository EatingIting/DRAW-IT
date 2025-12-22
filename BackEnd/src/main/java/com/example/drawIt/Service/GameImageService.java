package com.example.drawIt.Service;

import com.example.drawIt.DTO.GameImageDTO;
import org.springframework.stereotype.Service;
import org.springframework.util.FileSystemUtils;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GameImageService {

    private final String GAME_IMG_DIR = "C:/DrawIt/GameTemp/";
    private final Map<String, List<Map<String, String>>> roomGallery = new ConcurrentHashMap<>();
    private final Map<String, Map<String, Integer>> lobbyUserVotes = new ConcurrentHashMap<>();

    public void saveImage(GameImageDTO dto) {
        try {
            System.out.println("💾 [Service] 이미지 저장 로직 시작...");
            String directoryPath = GAME_IMG_DIR + dto.getLobbyId();
            Path path = Paths.get(directoryPath);
            if (!Files.exists(path)) {
                Files.createDirectories(path);
            }

            // 파일명: UUID_주제어.jpg
            String filename = UUID.randomUUID().toString() + "_" + dto.getKeyword() + ".jpg";
            String fullPath = directoryPath + "/" + filename;

            String base64Data = dto.getBase64Image().split(",")[1];
            byte[] imageBytes = Base64.getDecoder().decode(base64Data);

            try (FileOutputStream fos = new FileOutputStream(fullPath)) {
                fos.write(imageBytes);
            }

            Map<String, String> imageInfo = new HashMap<>();
            imageInfo.put("userId", dto.getUserId());
            imageInfo.put("nickname", dto.getNickname());
            imageInfo.put("keyword", dto.getKeyword());
            imageInfo.put("imageUrl", "/game/image/" + dto.getLobbyId() + "/" + filename); // 상대 경로 저장
            imageInfo.put("voteCount", "0");

            roomGallery.computeIfAbsent(dto.getLobbyId(), k -> new ArrayList<>()).add(imageInfo);

        } catch (IOException e) {
            e.printStackTrace();
            System.err.println("❌ [Service] 이미지 저장 중 오류 발생!");
        }
    }

    public List<Map<String, String>> getGallery(String lobbyId) {
        List<Map<String, String>> galleryList = new ArrayList<>();

        // 1. 메모리에 데이터가 있으면 그것을 반환 (가장 최신)
        if (roomGallery.containsKey(lobbyId)) {
            List<Map<String, String>> originalList = roomGallery.get(lobbyId);
            for(Map<String, String> info : originalList) {
                galleryList.add(new HashMap<>(info));
            }
            return galleryList;
        }

        // 2. 메모리에 없으면 파일 시스템에서 복구 (서버 재시작 시)
        File folder = new File(GAME_IMG_DIR + lobbyId);
        if (!folder.exists() || !folder.isDirectory()) {
            return galleryList;
        }

        File[] files = folder.listFiles();
        if (files == null) return galleryList;

        for (File file : files) {
            if (file.isFile()) {
                String filename = file.getName();

                // 🔥 [수정] 상대 경로로 통일 (프론트에서 API_BASE_URL 붙임)
                String accessUrl = "/game/image/" + lobbyId + "/" + filename;

                // 🔥 [수정] 파일명 파싱 로직 변경 (UUID_주제어.jpg)
                // parts[0]: UUID, parts[1]: 주제어.jpg
                String[] parts = filename.split("_");

                // 닉네임은 파일명에 없으므로 "Unknown"
                String nickname = "Unknown";

                // 주제어 추출
                String keyword = "Unknown";
                if (parts.length > 1) {
                    // 마지막 부분에서 확장자 제거
                    keyword = parts[parts.length - 1].replace(".jpg", "").replace(".png", "");
                }

                Map<String, String> map = new HashMap<>();
                map.put("filename", filename);
                map.put("nickname", nickname);
                map.put("keyword", keyword);
                map.put("imageUrl", accessUrl);
                map.put("voteCount", "0");

                galleryList.add(map);
            }
        }
        return galleryList;
    }

    public List<Integer> addVote(String lobbyId, Integer imageIndex, String userId) {
        System.out.println("투표 증가");
        // (이전 코드와 동일 - 생략하거나 위에서 제공한 코드 그대로 사용)
        List<Map<String, String>> images = roomGallery.get(lobbyId);
        if (images == null || imageIndex < 0 || imageIndex >= images.size()) return Collections.emptyList();

        lobbyUserVotes.putIfAbsent(lobbyId, new ConcurrentHashMap<>());
        Map<String, Integer> userVotes = lobbyUserVotes.get(lobbyId);

        synchronized (images) {
            if (userVotes.containsKey(userId)) {
                Integer oldIndex = userVotes.get(userId);
                if (oldIndex >= 0 && oldIndex < images.size()) {
                    Map<String, String> oldImg = images.get(oldIndex);
                    int cnt = Integer.parseInt(oldImg.getOrDefault("voteCount", "0"));
                    oldImg.put("voteCount", String.valueOf(Math.max(0, cnt - 1)));
                }
            }
            Map<String, String> newImg = images.get(imageIndex);
            int newCnt = Integer.parseInt(newImg.getOrDefault("voteCount", "0"));
            newImg.put("voteCount", String.valueOf(newCnt + 1));
            userVotes.put(userId, imageIndex);
        }

        List<Integer> counts = new ArrayList<>();
        for (Map<String, String> img : images) {
            counts.add(Integer.parseInt(img.getOrDefault("voteCount", "0")));
        }
        return counts;
    }

    public List<Map<String, String>> getWinners(String lobbyId) {
        List<Map<String, String>> allImages = getGallery(lobbyId);

        if (allImages.isEmpty()) return new ArrayList<>();

        // 1. 최다 득표수 계산
        int maxVote = allImages.stream()
                .mapToInt(img -> Integer.parseInt(img.getOrDefault("voteCount", "0")))
                .max()
                .orElse(0);

        // 🔥 [수정] 주석 해제! (0표만 있는 경우, 즉 오류 상황에서는 아무것도 리턴하지 않음)
        if (maxVote == 0) {
            return new ArrayList<>();
        }

        // 2. 우승자 필터링
        List<Map<String, String>> winners = new ArrayList<>();
        for (Map<String, String> img : allImages) {
            int voteCount = Integer.parseInt(img.getOrDefault("voteCount", "0"));
            if (voteCount == maxVote) {
                winners.add(img);
            }
        }
        return winners;
    }

    public void clearRoomData(String lobbyId) {
        if (roomGallery.containsKey(lobbyId)) roomGallery.remove(lobbyId);
        if (lobbyUserVotes.containsKey(lobbyId)) lobbyUserVotes.remove(lobbyId);
        try {
            FileSystemUtils.deleteRecursively(Paths.get(GAME_IMG_DIR + lobbyId));
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}