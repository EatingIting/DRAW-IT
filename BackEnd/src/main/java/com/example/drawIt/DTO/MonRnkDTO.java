package com.example.drawIt.DTO;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class MonRnkDTO {
    private Long imgId;
    private String topic;
    private long recommend;
    private String imgUrl;
}
