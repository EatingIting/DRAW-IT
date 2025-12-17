package com.example.drawIt.Controller;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.stereotype.Controller;

import java.util.Map;

@Controller
public class SocketChatController {

    @MessageMapping("/chat/bubble")
    public Map<String, Object> chatBubble(Map<String, Object> payload) {
        return Map.of(
            "type", "CHAT_BUBBLE",
            "userId", payload.get("userId"),
            "message", payload.get("message")
        );
    }
}
