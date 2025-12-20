package com.example.drawIt.Controller;

import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.net.MalformedURLException;
import java.nio.file.Path;
import java.nio.file.Paths;

@RestController
public class ImageController {

    private final String BASE_DIR = "C:/DrawIt/MonthlyRank/";

    @GetMapping("/image/{date}/{filename}")
    public ResponseEntity<Resource> serveFile(@PathVariable String date,
                                              @PathVariable String filename) {
        try {
            System.out.println("날짜: " + date);
            System.out.println("파일명: " + filename);
            Path file = Paths.get(BASE_DIR + date + "/" + filename);
            Resource resource = new UrlResource(file.toUri());

            if (resource.exists() || resource.isReadable()) {
                return ResponseEntity.ok()
                        .contentType(MediaType.IMAGE_JPEG)
                        .body(resource);
            }else{
                return ResponseEntity.notFound().build();
            }
        } catch (MalformedURLException e) {
            return ResponseEntity.badRequest().build();
        }
    }
}
