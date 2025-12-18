import { useEffect, useState } from 'react';
import './MonthlyRanking.css';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const MonthlyRanking = () => {
  const [imgs, setImgs] = useState([]);
  const [isLocked, setIsLocked] = useState(false); // 애니메이션 중 클릭 방지 상태
  const [titleDate, setTitleDate] = useState("");
  
  const top3Data = imgs.slice(0, 3).filter(item => item);
  const restImgs = imgs.length > 3 ? imgs.slice(3) : [];

  const maxScore = imgs[0]?.rec || 1; 
  const maxPixelHeight = 250;

  useEffect(() => {
    (async() => {
      try {
        const now = new Date();
        const fullYear = now.getFullYear(); // 2024 (표시용)
        const year = String(fullYear).slice(-2); // 24 (API용)
        const month = String(now.getMonth() + 1).padStart(2, '0'); // 12
        
        const yyMM = `${year}${month}`;

        setTitleDate(`${fullYear}.${month}`);

        let response = await axios.get(`http://localhost:8080/monRnk/getMonRnk/${yyMM}`);
        const mappedData = response.data.map((item) => ({
          id: item.imgId,
          topic: item.topic,
          rec: item.recommend,
          url: item.imgUrl
        }));
        setImgs(mappedData.sort((a, b) => b.rec - a.rec));
      } catch (error) {
        console.error("통신 에러:", error);
      }
    })();
  }, []);

  const handleClick = async (id) => {
    // 1. 이미 락이 걸려있다면(순위 변동 애니메이션 중) 클릭 무시
    if (isLocked) return;

    try{
      // ✨ [수정 핵심] 무조건 락을 거는 것이 아니라, 미리 계산 후 판단
      
      // A. 현재 상태 복사 및 점수 증가 시뮬레이션
      const nextImgs = imgs.map((img) =>
        img.id === id ? { ...img, rec: img.rec + 1} : img
      );

      // B. 점수 순으로 정렬 시뮬레이션
      const sortedNextImgs = [...nextImgs].sort((a, b) => b.rec - a.rec);

      // C. 순위 변동 여부 확인
      // 현재 순서(ID 배열)와 바뀔 순서(ID 배열)를 비교
      const currentOrder = imgs.map(img => img.id).join(',');
      const nextOrder = sortedNextImgs.map(img => img.id).join(',');
      const isRankChanged = currentOrder !== nextOrder;

      // D. 순위가 바뀔 때만 락을 걸고 타임아웃 설정
      if (isRankChanged) {
        setIsLocked(true);
        setTimeout(() => {
          setIsLocked(false);
        }, 1000); // 애니메이션 시간(약 1초) 동안 클릭 방지
      }
      // 서버 업데이트
      await axios.post(`http://localhost:8080/monRnk/increaseRec/${id}`);

      // E. 상태 업데이트 (순위가 안 바뀌면 즉시 반영, 바뀌면 락 걸린 상태로 반영)
      setImgs(sortedNextImgs);

    } catch(error){
      console.log("추천 업데이트 실패: ", error);
    }
  }

  return (
    // 락이 걸렸을 때만 'click-locked' 클래스 추가 (CSS에서 pointer-events: none 처리)
    <div className={`ranking-container ${isLocked ? 'click-locked' : ''}`}>
      <AnimatePresence>
      <motion.div className="podium-section" layout>
        {top3Data.map((img, index) => {
          
          let positionClass = '';
          let rankClass = '';
          let rankNum = index + 1;

          let rankSuffix = 'th';
          if (rankNum === 1) rankSuffix = 'st';
          else if (rankNum === 2) rankSuffix = 'nd';
          else if (rankNum === 3) rankSuffix = 'rd';

          const isFirst = index === 0;
          const itemWidth = isFirst ? 320 : 280;

          if (index === 0) { positionClass = 'pos-center'; rankClass = 'first'; } 
          else if (index === 1) { positionClass = 'pos-left'; rankClass = 'second'; } 
          else { positionClass = 'pos-right'; rankClass = 'third'; }

          let calculatedHeight = (img.rec / maxScore) * maxPixelHeight;
          calculatedHeight = Math.max(130, calculatedHeight);

          return (
            <motion.div 
              key={img.id}
              layout 
              className={`podium-item ${positionClass} ${rankClass}`}
              style={{ 
                width: `${itemWidth}px`, 
                marginLeft: `-${itemWidth / 2}px`,
                zIndex: isFirst ? 10 : 5 
              }}
              initial={{ opacity: 0, y: 50 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
              transition={{ 
                type: "spring", stiffness: 300, damping: 25 
              }}
            >
              <div className="img-wrapper">
                  <motion.img 
                    layoutId={img.id} 
                    src={img.url} 
                    alt={img.topic} 
                    className="ranking-img"
                    onClick={() => handleClick(img.id)}

                    whileHover={{ scale: 1.15, rotate: -5 }} 
                    whileTap={{ 
                      scale: 1.15, 
                      rotate: [0, -5, 5, -5, 0], // CSS @keyframes paperShake 효과를 배열로 구현
                      transition: { duration: 0.4 }
                    }}
                    style={{
                        cursor: 'pointer',
                        width: isFirst ? '240px' : '200px',
                        height: isFirst ? '240px' : '200px'
                    }}
                  />
              </div>
              
              <motion.div 
                className="pillar" 
                style={{ height: `${calculatedHeight}px` }}
                layout 
              >
                <div className="snow-cap"><div className="img-topic">{img.topic}</div></div> 
                <div className="ribbon"></div>
                <span className="rank-text">{rankNum}{rankSuffix}</span>
                <motion.span key={img.rec} className="recommend">{img.rec}</motion.span>
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
      </AnimatePresence>

      <div className="hall-of-fame-title">
        {titleDate} <br/>명예의 전당
      </div>

      <div className="list-section">
        <motion.div className="grid-container" layout>
          <AnimatePresence>
          {restImgs.map((img) => (
            <motion.div 
              key={img.id} 
              layout
              className="grid-item"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }} 
            >
               <motion.img 
                  layoutId={img.id}
                  src={img.url} 
                  alt={img.topic} 
                  className="list-avatar" 
                  onClick={() => handleClick(img.id)} 
                  style={{cursor: "pointer"}}

                  whileHover={{ scale: 1.15, rotate: -5 }}
                  whileTap={{ 
                    scale: 1.15, 
                    rotate: [0, -5, 5, -5, 0],
                    transition: { duration: 0.4 }
                  }}
               />
               <div className="list-topic">{img.topic}</div>
               <div className="list-rec">{img.rec}</div>
            </motion.div>
          ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
};

export default MonthlyRanking;