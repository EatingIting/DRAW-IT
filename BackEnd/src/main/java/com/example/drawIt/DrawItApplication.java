package com.example.drawIt;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class DrawItApplication {

	public static void main(String[] args) {
		SpringApplication.run(DrawItApplication.class, args);
	}

}
