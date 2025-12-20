package com.example.drawIt.Controller;

import com.example.drawIt.DTO.MonRnkDTO;
import com.example.drawIt.Service.MonRnkService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/monRnk")
@CrossOrigin(origins = "http://localhost:3000")
public class MonRnkController {

    @Autowired
    private MonRnkService monRnkService;

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

    @PostMapping("/increaseRec/{imgId}")
    public ResponseEntity<Void> increaseRec(@PathVariable Long imgId){
        if(monRnkService.increaseRec(imgId)){
            return ResponseEntity.ok().build();
        }else{
            return ResponseEntity.badRequest().build();
        }
    }
}
