import { useEffect, useState } from 'react';
import './MonthlyRanking.css';
import axios from 'axios';
// ✨ 1. Framer Motion 임포트
import { motion, AnimatePresence } from 'framer-motion';

const MonthlyRanking = () => {
  const [imgs, setImgs] = useState([]);
  
  // 상위 3명과 나머지 분리
  // ✨ slice(0, 3)은 항상 3개 배열을 반환하므로 안전하게 filter로 실제 데이터만 남김
  const top3Data = imgs.slice(0, 3).filter(item => item);
  const restImgs = imgs.length > 3 ? imgs.slice(3) : [];

  const maxScore = imgs[0]?.rec || 1; 
  const maxPixelHeight = 250;

  useEffect(() => {
    (async() => {
      try {
        let response = await axios.get("http://localhost:8080/monRnk/getMonRnk");
        
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
    try{
      // (백엔드 연동 시 주석 해제)
      await axios.post(`http://localhost:8080/monRnk/increaseRec/${id}`);
      
      // ✨ 즉각적인 UI 반응을 위한 낙관적 업데이트
      setImgs((prev) => {
        const newImgs = prev.map((img) =>
          img.id === id ? { ...img, rec: img.rec + 1} : img
        );
        // 점수 변경 후 재정렬 -> 순위 변경 발생
        return [...newImgs].sort((a, b) => b.rec - a.rec);
      });

    }catch(error){
      console.log("추천 업데이트 실패: ", error);
    }
  }

  return (
    <div className="ranking-container">
      <AnimatePresence>
      <motion.div className="podium-section" layout>
        {top3Data.map((img, index) => {
          
          let positionClass = '';
          let rankClass = '';
          let rankNum = index + 1;

          if (index === 0) { positionClass = 'pos-center'; rankClass = 'first'; } 
          else if (index === 1) { positionClass = 'pos-left'; rankClass = 'second'; } 
          else { positionClass = 'pos-right'; rankClass = 'third'; }

          let calculatedHeight = (img.rec / maxScore) * maxPixelHeight;
          calculatedHeight = Math.max(130, calculatedHeight);

          return (
            <motion.div 
              key={img.id}
              layoutId={img.id} 
              layout 
              className={`podium-item ${positionClass} ${rankClass}`}
              // ✨ 1. Pop 등장 효과 강화
              // 처음 나타날 때(initial) 약간 위에서 더 크게 시작해서,
              // 제자리로(animate) 튕기며 돌아옵니다.
              initial={{ opacity: 0, scale: 1.2, y: -30 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
              // 튕기는 느낌을 더 강하게 주는 스프링 설정
              transition={{ 
                type: "spring", 
                stiffness: 400, 
                damping: 25,
                mass: 1.2 
              }}
            >
              {/* ✨ 2. Flash 효과를 위한 래퍼 애니메이션 추가 */}
              <motion.div 
                className="img-wrapper"
                // 처음 마운트될 때 황금색 빛이 번쩍이는 애니메이션
                initial={{ filter: "drop-shadow(0 0 0 rgba(255,215,0,0))" }}
                animate={{ 
                    filter: [
                        "drop-shadow(0 0 0 rgba(255,215,0,0))", // 시작
                        "drop-shadow(0 0 30px rgba(255,215,0,0.8))", // 중간에 강한 빛
                        "drop-shadow(0 0 0 rgba(255,215,0,0))" // 끝
                    ]
                }}
                transition={{ duration: 0.8, ease: "easeInOut", times: [0, 0.2, 1] }}
              >
                  <motion.img 
                    src={img.url} 
                    alt={img.topic} 
                    className="ranking-img"
                    onClick={() => handleClick(img.id)}
                    style={{cursor: 'pointer'}}
                    layout 
                  />
                  <span className="rank-badge">{rankNum}</span>
              </motion.div>
              
              <motion.div 
                className="pillar" 
                style={{ height: `${calculatedHeight}px` }}
                layout
              >
                {/* ... (기둥 내부 내용 동일) ... */}
                <div className="snow-cap"><div className="img-topic">{img.topic}</div></div> 
                <div className="ribbon"></div>
                <span className="rank-text">{rankNum}st</span>
                <motion.span key={img.rec} className="recommend">{img.rec}</motion.span>
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>
      </AnimatePresence>

      {/* --- 하단: 나머지 리스트 (이전과 동일) --- */}
      <div className="list-section">
        <motion.div className="grid-container" layout>
          <AnimatePresence>
          {restImgs.map((img) => (
            <motion.div 
              key={img.id} 
              layoutId={img.id}
              layout
              className="grid-item"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.3 } }} // 사라질 때 좀 더 빨리 작아지게
            >
               {/* ... (리스트 아이템 내용 동일) ... */}
               <img src={img.url} alt={img.topic} className="list-avatar" onClick={() => handleClick(img.id)} style={{cursor: "pointer"}}/>
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