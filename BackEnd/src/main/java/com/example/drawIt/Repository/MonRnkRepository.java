package com.example.drawIt.Repository;

import com.example.drawIt.Entity.MonRnk;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Date;
import java.util.List;

public interface MonRnkRepository extends JpaRepository<MonRnk, Long> {
    Slice<MonRnk> findByRegDateBetweenOrderByRecommendDesc(Date startDate, Date endDate, Pageable pageable);
}
