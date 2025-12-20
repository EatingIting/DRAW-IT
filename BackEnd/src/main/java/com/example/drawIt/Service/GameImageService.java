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

    // 게임 이미지가 저장될 루트 경로
    private final String GAME_IMG_DIR = "C:/DrawIt/GameTemp/";

    // [중요] 방 별로 생성된 이미지 정보를 메모리에 임시 저장 (DB 대용)
    // Key: lobbyId, Value: 해당 방의 이미지 리스트
    private final Map<String, List<Map<String, String>>> roomGallery = new ConcurrentHashMap<>();

    public void saveImage(GameImageDTO dto) {
        try {
            System.out.println("💾 [Service] 이미지 저장 로직 시작...");

            // 1. 방 ID로 디렉토리 생성 (방 분리의 핵심!)
            String directoryPath = GAME_IMG_DIR + dto.getLobbyId();
            Path path = Paths.get(directoryPath);
            if (!Files.exists(path)) {
                Files.createDirectories(path);
                System.out.println("   - 폴더 생성됨: " + directoryPath);
            }

            // 2. 파일명 생성 (UUID를 붙여 중복 방지)
            String filename = UUID.randomUUID().toString() + "_" + dto.getKeyword() + ".jpg";
            String fullPath = directoryPath + "/" + filename;

            // 3. Base64 디코딩 및 파일 저장
            // 프론트에서 보낸 데이터 중 "data:image/jpeg;base64," 접두사 제거 필요
            String base64Data = dto.getBase64Image().split(",")[1];
            byte[] imageBytes = Base64.getDecoder().decode(base64Data);

            try (FileOutputStream fos = new FileOutputStream(fullPath)) {
                fos.write(imageBytes);
            }
            System.out.println("   - 파일 저장 완료: " + fullPath);

            // 4. 메모리에 저장 정보 등록 (나중에 투표 화면으로 넘겨줄 데이터)
            Map<String, String> imageInfo = new HashMap<>();
            imageInfo.put("userId", dto.getUserId());
            imageInfo.put("nickname", dto.getNickname());
            imageInfo.put("keyword", dto.getKeyword());
            // 클라이언트가 이미지에 접근할 URL (ImageController와 매칭)
            imageInfo.put("imageUrl", "/game/image/" + dto.getLobbyId() + "/" + filename);

            // 해당 방 리스트에 추가
            roomGallery.computeIfAbsent(dto.getLobbyId(), k -> new ArrayList<>()).add(imageInfo);

            printCurrentList(dto.getLobbyId());

        } catch (IOException e) {
            e.printStackTrace();
            System.err.println("❌ [Service] 이미지 저장 중 오류 발생!");
            throw new RuntimeException("이미지 저장 실패");
        }
    }

    // 게임 종료 시 해당 방의 모든 이미지 리스트 반환

    public List<Map<String, String>> getGallery(String lobbyId) {
        List<Map<String, String>> galleryList = new ArrayList<>();

        // 1. 해당 로비의 폴더 경로
        File folder = new File(GAME_IMG_DIR + lobbyId);

        // 2. 폴더가 없거나 파일이 없으면 빈 리스트 반환
        if (!folder.exists() || !folder.isDirectory()) {
            return galleryList;
        }

        File[] files = folder.listFiles();
        if (files == null) return galleryList;

        // 3. 파일 목록을 순회하며 DTO(Map) 생성
        for (File file : files) {
            if (file.isFile()) {
                String filename = file.getName();

                // 🔥 [핵심 변경] 프론트엔드가 바로 쓸 수 있는 URL 생성
                // GameImageController의 @GetMapping("/game/image/{lobbyId}/{filename}") 주소와 일치해야 함
                String accessUrl = "http://localhost:8080/game/image/" + lobbyId + "/" + filename;

                // 파일명에서 정보 파싱 (예: uuid_닉네임_주제어.jpg)
                // (기존에 파싱 로직이 있다면 그대로 사용하세요. 여기서는 예시로 간단히 처리합니다.)
                String[] parts = filename.split("_");
                String nickname = (parts.length > 1) ? parts[1] : "Unknown";
                String keyword = (parts.length > 2) ? parts[2].replace(".jpg", "").replace(".png", "") : "Unknown";

                Map<String, String> map = new HashMap<>();
                map.put("filename", filename);
                map.put("nickname", nickname);
                map.put("keyword", keyword);

                // ✅ 완성된 URL을 담아서 보냄
                map.put("imageUrl", accessUrl);

                galleryList.add(map);
            }
        }

        return galleryList;
    }

    // 방 삭제 시 데이터 정리 (메모리 누수 방지)
    public void clearRoomData(String lobbyId) {
        // 1. 메모리에서 데이터 제거
        if (roomGallery.containsKey(lobbyId)) {
            roomGallery.remove(lobbyId);
            System.out.println("   - 메모리 데이터 삭제 완료");
        }

        // 2. 실제 폴더 및 파일 삭제
        try {
            Path dirPath = Paths.get(GAME_IMG_DIR + lobbyId);
            // 스프링의 FileSystemUtils를 쓰면 폴더 안의 파일까지 재귀적으로 싹 지워줍니다.
            boolean deleted = FileSystemUtils.deleteRecursively(dirPath);

            if (deleted) {
                System.out.println("   - 디스크 파일 삭제 완료: " + dirPath);
            } else {
                System.out.println("   - 삭제할 파일이 없거나 실패함 (이미 지워졌을 수도 있음)");
            }
        } catch (IOException e) {
            System.err.println("❌ [Service] 파일 삭제 중 에러 발생: " + e.getMessage());
        }
    }

    private void printCurrentList(String lobbyId) {
        List<Map<String, String>> list = roomGallery.get(lobbyId);
        System.out.println("\n   📊 [현재 방(" + lobbyId + ") 저장된 그림 목록]");
        System.out.println("   --------------------------------------------------");
        if (list == null || list.isEmpty()) {
            System.out.println("   (데이터 없음)");
        } else {
            for (int i = 0; i < list.size(); i++) {
                Map<String, String> info = list.get(i);
                System.out.println(String.format("   [%d] 유저: %s | 주제어: %s | URL: %s",
                        (i + 1), info.get("nickname"), info.get("keyword"), info.get("imageUrl")));
            }
        }
        System.out.println("   --------------------------------------------------\n");
    }
}