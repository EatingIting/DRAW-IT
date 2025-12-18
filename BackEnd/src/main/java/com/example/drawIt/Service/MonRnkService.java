package com.example.drawIt.Service;

import com.example.drawIt.DTO.MonRnkDTO;
import com.example.drawIt.Entity.MonRnk;
import com.example.drawIt.Repository.MonRnkRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.*;

@Service
public class MonRnkService {
    @Autowired
    private MonRnkRepository monRnkRepository;

    public List<MonRnkDTO> getMonRnk(String yyMM, Pageable pageable) { // 매개변수 추가

        Calendar cal = Calendar.getInstance();
        SimpleDateFormat sdf = new SimpleDateFormat("yyMM");

        try {
            Date targetDate = sdf.parse(yyMM); // "2412" -> 2024년 12월 1일 00:00:00 (Date 객체)
            cal.setTime(targetDate);
        } catch (ParseException e) {
            // 날짜 형식이 잘못되었을 경우 예외 처리 (로그 출력 후 빈 리스트 반환 등)
            e.printStackTrace();
            return new ArrayList<>();
        }

        // [변경 2] 해당 월의 1일 00:00:00 설정 (Start Date)
        // 위에서 cal.setTime()을 했으므로 년/월은 이미 설정됨. 일/시/분/초만 초기화
        cal.set(Calendar.DAY_OF_MONTH, 1);
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        Date startDate = cal.getTime();

        // [변경 3] 해당 월의 마지막 날 23:59:59 설정 (End Date)
        cal.set(Calendar.DAY_OF_MONTH, cal.getActualMaximum(Calendar.DAY_OF_MONTH));
        cal.set(Calendar.HOUR_OF_DAY, 23);
        cal.set(Calendar.MINUTE, 59);
        cal.set(Calendar.SECOND, 59);
        cal.set(Calendar.MILLISECOND, 999);
        Date endDate = cal.getTime();

        // DB 조회
        Slice<MonRnk> entities = monRnkRepository.findByRegDateBetweenOrderByRecommendDesc(startDate, endDate, pageable);

        List<MonRnkDTO> dtoList = new ArrayList<>();
        SimpleDateFormat folderFormat = new SimpleDateFormat("yyMM");

        for(MonRnk entity: entities){
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
