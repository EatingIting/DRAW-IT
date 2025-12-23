package com.example.drawIt.Controller;

import com.example.drawIt.DTO.MonRnkDTO;
import com.example.drawIt.Service.MonRnkService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.MalformedURLException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/monRnk")
@CrossOrigin(origins = "*")
public class MonRnkController {

    @Autowired
    private MonRnkService monRnkService;

    private final String MONTHLY_RANK_DIR = "C:/DrawIt/MonthlyRank/";

    @GetMapping("/getMonRnk/{yyMM}")
    public ResponseEntity<List<MonRnkDTO>> getMonRnk(
            @PathVariable String yyMM,
            @RequestParam(defaultValue = "0") int page, // 페이지 번호 (기본 0)
            @RequestParam(defaultValue = "8") int size  // 페이지 크기 (기본 8)
    ) {
        System.out.println("getMonRnk 진입");
        // PageRequest 생성
        Pageable pageable = PageRequest.of(page, size);

        List<MonRnkDTO> listMonRnk = monRnkService.getMonRnk(yyMM, pageable);
        return ResponseEntity.ok().body(listMonRnk);
    }

    @PostMapping("/saveWinners")
    public ResponseEntity<String> saveWinners(@RequestBody List<Map<String, String>> winners) {
        System.out.println("🏅 [Controller] 명예의 전당 저장 요청 수신: " + winners.size() + "개");
        monRnkService.saveWinners(winners);
        return ResponseEntity.ok("Saved to Hall of Fame");
    }

    @GetMapping("/image/{yyMM}/{filename}")
    public ResponseEntity<Resource> serveMonthlyImage(@PathVariable String yyMM, @PathVariable String filename) {
        try {
            Path file = Paths.get(MONTHLY_RANK_DIR + yyMM + "/" + filename);
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

    @PostMapping("/increaseRec/{imgId}")
    public ResponseEntity<Void> increaseRec(@PathVariable Long imgId){
        if(monRnkService.increaseRec(imgId)){
            return ResponseEntity.ok().build();
        }else{
            return ResponseEntity.badRequest().build();
        }
    }
}
