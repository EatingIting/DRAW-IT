package com.example.drawIt.Controller;

import com.example.drawIt.DTO.MonRnkDTO;
import com.example.drawIt.Service.MonRnkService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@CrossOrigin(origins = "http://localhost:3000")
public class MonRnkController {

    @Autowired
    private MonRnkService monRnkService;

    @GetMapping("/getMonRnk")
    public ResponseEntity<List<MonRnkDTO>> getMonRnk() {
        List<MonRnkDTO> listMonRnk = monRnkService.getMonRnk();
        return ResponseEntity.ok().body(listMonRnk);
    }
}
