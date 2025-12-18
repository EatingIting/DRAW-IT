package com.example.drawIt.Controller;

import com.example.drawIt.DTO.MonRnkDTO;
import com.example.drawIt.Service.MonRnkService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/monRnk")
@CrossOrigin(origins = "http://localhost:3000")
public class MonRnkController {

    @Autowired
    private MonRnkService monRnkService;

    @GetMapping("/getMonRnk/{yyMM}") // {yyMM} 경로 변수 추가
    public ResponseEntity<List<MonRnkDTO>> getMonRnk(@PathVariable String yyMM) {
        // 서비스 메서드에 yyMM 전달
        List<MonRnkDTO> listMonRnk = monRnkService.getMonRnk(yyMM);
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
