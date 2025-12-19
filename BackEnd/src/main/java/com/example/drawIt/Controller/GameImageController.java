package com.example.drawIt.Controller;

import com.example.drawIt.DTO.GameImageDTO;
import com.example.drawIt.Service.GameImageService;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import lombok.RequiredArgsConstructor;

import java.net.MalformedURLException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class GameImageController {

    private final GameImageService gameImageService;
    private final String GAME_IMG_DIR = "C:/DrawIt/GameTemp/";

    // 1. 이미지 저장 요청 (프론트에서 라운드 끝날 때 호출)
    @PostMapping("/api/game/image/save")
    public ResponseEntity<String> saveRoundImage(@RequestBody GameImageDTO dto) {
        System.out.println("\n==================================================");
        System.out.println("📡 [Controller] 이미지 저장 요청 도착!");
        System.out.println("   - 방 ID: " + dto.getLobbyId());
        System.out.println("   - 유저: " + dto.getNickname() + " (" + dto.getUserId() + ")");
        System.out.println("   - 주제어: " + dto.getKeyword());
        System.out.println("==================================================\n");

        gameImageService.saveImage(dto);
        return ResponseEntity.ok("Saved");
    }

    // 2. 게임 종료 후 투표용 전체 리스트 가져오기
    @GetMapping("/api/game/{lobbyId}/gallery")
    public ResponseEntity<List<Map<String, String>>> getGallery(@PathVariable String lobbyId) {
        System.out.println("\n📂 [Controller] 갤러리 목록 요청 수신 (방 ID: " + lobbyId + ")");

        List<Map<String, String>> gallery = gameImageService.getGallery(lobbyId);

        System.out.println("   -> 총 " + gallery.size() + "장의 그림 정보를 반환합니다.");
        return ResponseEntity.ok(gallery);
    }

    // 3. [수정된 부분] 이미지 파일 서빙 (HTML <img> 태그에서 src로 호출)
    // URL 패턴: /game/image/{lobbyId}/{filename}
    @GetMapping("/game/image/{lobbyId}/{filename}")
    public ResponseEntity<Resource> serveGameFile(@PathVariable String lobbyId,
                                                  @PathVariable String filename) {
        try {
            // 경로에 lobbyId가 포함되므로 다른 방과 섞일 일이 없음
            Path file = Paths.get(GAME_IMG_DIR + lobbyId + "/" + filename);
            Resource resource = new UrlResource(file.toUri());

            if (resource.exists() || resource.isReadable()) {
                return ResponseEntity.ok()
                        .contentType(MediaType.IMAGE_JPEG)
                        .body(resource);
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (MalformedURLException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    // 언제 호출? -> 투표 화면이 끝나고 방이 사라질 때, 혹은 방장이 방을 폭파할 때
    @DeleteMapping("/api/game/{lobbyId}/clear")
    public ResponseEntity<String> clearGameData(@PathVariable String lobbyId) {
        System.out.println("🧹 [Controller] 방 데이터 삭제 요청 수신 (LobbyId: " + lobbyId + ")");

        gameImageService.clearRoomData(lobbyId);

        return ResponseEntity.ok("Cleaned up");
    }
}