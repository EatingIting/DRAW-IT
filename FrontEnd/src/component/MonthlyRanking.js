import { useEffect, useState } from 'react';
import './MonthlyRanking.css';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const MonthlyRanking = () => {
  const [imgs, setImgs] = useState([]);
  
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
      // await axios.post(`http://localhost:8080/monRnk/increaseRec/${id}`);
      setImgs((prev) => {
        const newImgs = prev.map((img) =>
          img.id === id ? { ...img, rec: img.rec + 1} : img
        );
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

          // ✨ 1등과 나머지의 크기(너비)를 변수로 설정
          // 1등은 좀 더 넓게(320px), 나머지는 기본(280px)
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
              layout // layout 속성 유지 (위치 이동 애니메이션용)
              className={`podium-item ${positionClass} ${rankClass}`}
              
              // ✨ [핵심 수정 1] scale 애니메이션 제거하고 실제 스타일(width) 변경
              // marginLeft를 width의 절반으로 설정하여 항상 정확한 중앙 정렬 유지
              style={{ 
                width: `${itemWidth}px`, 
                marginLeft: `-${itemWidth / 2}px`,
                zIndex: isFirst ? 10 : 5 // 1등이 앞으로 오게
              }}
              
              // ✨ [핵심 수정 2] animate에서 scale 제거 (이제 width가 변하므로 필요 없음)
              initial={{ opacity: 0, y: 50 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
              
              transition={{ 
                type: "spring", stiffness: 300, damping: 25 
              }}
            >
              <div className="img-wrapper">
                  {/* ✨ 중요 수정 2: 이미지가 날아오도록 여기에 layoutId 추가 */}
                  <motion.img 
                    layoutId={img.id} 
                    src={img.url} 
                    alt={img.topic} 
                    className="ranking-img"
                    onClick={() => handleClick(img.id)}
                    style={{
                        cursor: 'pointer',
                        // ✨ [핵심 수정 3] 이미지 크기도 1등일 때 실제 px로 키움
                        width: isFirst ? '240px' : '200px',
                        height: isFirst ? '240px' : '200px'
                    }}
                  />
                  <span className="rank-badge">{rankNum}</span>
              </div>
              
              <motion.div 
                className="pillar" 
                style={{ height: `${calculatedHeight}px` }}
                layout // 기둥 높이 변화 애니메이션
              >
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

      <div className="list-section">
        <motion.div className="grid-container" layout>
          <AnimatePresence>
          {restImgs.map((img) => (
            <motion.div 
              key={img.id} 
              /* 🚨 중요 수정 3: 여기서도 layoutId 삭제 */
              layout
              className="grid-item"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }} 
            >
               {/* ✨ 중요 수정 4: 리스트의 이미지에도 layoutId 추가 */}
               <motion.img 
                 layoutId={img.id}
                 src={img.url} 
                 alt={img.topic} 
                 className="list-avatar" 
                 onClick={() => handleClick(img.id)} 
                 style={{cursor: "pointer"}}
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