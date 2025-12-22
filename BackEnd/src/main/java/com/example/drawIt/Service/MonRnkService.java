package com.example.drawIt.Service;

import com.example.drawIt.DTO.MonRnkDTO;
import com.example.drawIt.Entity.MonRnk;
import com.example.drawIt.Repository.MonRnkRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.*;

@Service
public class MonRnkService {
    @Autowired
    private MonRnkRepository monRnkRepository;

    private final String GAME_TEMP_DIR = "C:/DrawIt/GameTemp/";
    private final String MONTHLY_RANK_DIR = "C:/DrawIt/MonthlyRank/";

    public List<MonRnkDTO> getMonRnk(String yyMM, Pageable pageable) {

        Calendar cal = Calendar.getInstance();
        SimpleDateFormat sdf = new SimpleDateFormat("yyMM");

        try {
            Date targetDate = sdf.parse(yyMM);
            cal.setTime(targetDate);
        } catch (ParseException e) {
            e.printStackTrace();
            return new ArrayList<>();
        }

        cal.set(Calendar.DAY_OF_MONTH, 1);
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        Date startDate = cal.getTime();

        cal.set(Calendar.DAY_OF_MONTH, cal.getActualMaximum(Calendar.DAY_OF_MONTH));
        cal.set(Calendar.HOUR_OF_DAY, 23);
        cal.set(Calendar.MINUTE, 59);
        cal.set(Calendar.SECOND, 59);
        cal.set(Calendar.MILLISECOND, 999);
        Date endDate = cal.getTime();

        Slice<MonRnk> entities = monRnkRepository.findByRegDateBetweenOrderByRecommendDesc(startDate, endDate, pageable);

        List<MonRnkDTO> dtoList = new ArrayList<>();
        SimpleDateFormat folderFormat = new SimpleDateFormat("yyMM");

        for(MonRnk entity: entities){
            String dateFolder = folderFormat.format(entity.getRegDate());
            String filename = entity.getImgName();

            // [수정 완료] filename에 이미 확장자가 있으므로 .jpg를 제거했습니다.
            // URL 경로는 Controller 설정(/monRnk/image/...)에 맞췄습니다.
            String accessUrl = "http://localhost:8080/monRnk/image/" + dateFolder + "/" + filename;

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
    public void saveWinners(List<Map<String, String>> winners) {
        SimpleDateFormat sdf = new SimpleDateFormat("yyMM");
        Date now = new Date();
        String currentMonthFolder = sdf.format(now);

        String targetDirPath = MONTHLY_RANK_DIR + currentMonthFolder;
        File targetDir = new File(targetDirPath);
        if (!targetDir.exists()) {
            targetDir.mkdirs();
        }

        for (Map<String, String> info : winners) {
            String lobbyId = info.get("lobbyId");
            String filename = info.get("filename");
            String keyword = info.get("keyword");

            Path sourcePath = Paths.get(GAME_TEMP_DIR + lobbyId + "/" + filename);
            Path targetPath = Paths.get(targetDirPath + "/" + filename);

            try {
                if (Files.exists(sourcePath)) {
                    Files.copy(sourcePath, targetPath, StandardCopyOption.REPLACE_EXISTING);
                    System.out.println("💾 파일 복사 완료: " + targetPath.toString());

                    MonRnk monRnk = MonRnk.builder()
                            .imgName(filename)
                            .imgUrl(targetPath.toString())
                            .topic(keyword)
                            .recommend(0)
                            .regDate(now)
                            .build();

                    monRnkRepository.save(monRnk);
                } else {
                    System.err.println("❌ 원본 파일을 찾을 수 없음: " + sourcePath);
                }
            } catch (IOException e) {
                e.printStackTrace();
                System.err.println("❌ 파일 복사 중 에러 발생: " + filename);
            }
        }
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