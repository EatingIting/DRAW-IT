package com.example.drawIt.Service;

import com.example.drawIt.DTO.MonRnkDTO;
import com.example.drawIt.Entity.MonRnk;
import com.example.drawIt.Repository.MonRnkRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.SimpleDateFormat;
import java.util.*;

@Service
public class MonRnkService {
    @Autowired
    private MonRnkRepository monRnkRepository;

    public List<MonRnkDTO> getMonRnk() {
        // 현재 날짜 기준 캘린더 객체 생성
        Calendar cal = Calendar.getInstance();

        // 이번 달 1일 00:00:00 설정 (Start Date)
        cal.set(Calendar.DAY_OF_MONTH, 1);
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        Date startDate = cal.getTime();

        // 이번 달 마지막 날 23:59:59 설정 (End Date)
        cal.set(Calendar.DAY_OF_MONTH, cal.getActualMaximum(Calendar.DAY_OF_MONTH));
        cal.set(Calendar.HOUR_OF_DAY, 23);
        cal.set(Calendar.MINUTE, 59);
        cal.set(Calendar.SECOND, 59);
        cal.set(Calendar.MILLISECOND, 999);
        Date endDate = cal.getTime();

        List<MonRnk> entites = monRnkRepository.findByRegDateBetweenOrderByRecommendDesc(startDate, endDate);

        List<MonRnkDTO> dtoList = new ArrayList<>();
        SimpleDateFormat folderFormat = new SimpleDateFormat("yyMM");

        for(MonRnk entity: entites){
            String dateFolder = folderFormat.format(entity.getRegDate());

            String filename = entity.getImgName();

            String accessUrl = "http://localhost:8080/image/" + dateFolder + "/" + filename + ".jpg";

            MonRnkDTO dto = MonRnkDTO.builder()
                    .imgId(entity.getImgId())
                    .topic(entity.getTopic())
                    .recommend(entity.getRecommend())
                    .imgUrl(accessUrl).build();

            dtoList.add(dto);
        }

        return dtoList;
    }

    @Transactional
    public boolean increaseRec(long imgId){
        Optional<MonRnk> optionalMonRnk = monRnkRepository.findById(imgId);

        if(optionalMonRnk.isPresent()){
            MonRnk monRnk = optionalMonRnk.get();
            monRnk.setRecommend(monRnk.getRecommend() + 1);
            monRnkRepository.save(monRnk);
            return true;
        }

        return false;
    }
}
