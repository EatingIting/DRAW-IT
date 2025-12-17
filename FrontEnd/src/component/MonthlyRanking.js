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

          if (index === 0) { positionClass = 'pos-center'; rankClass = 'first'; } 
          else if (index === 1) { positionClass = 'pos-left'; rankClass = 'second'; } 
          else { positionClass = 'pos-right'; rankClass = 'third'; }

          let calculatedHeight = (img.rec / maxScore) * maxPixelHeight;
          calculatedHeight = Math.max(130, calculatedHeight);

          return (
            <motion.div 
              key={img.id}
              /* 🚨 중요 수정 1: 여기서 layoutId 삭제! 상자는 날아오지 않습니다. */
              /* 대신 layout 속성은 유지해야 1,2,3등끼리 자리 바꿀 때 부드럽습니다. */
              layout 

              className={`podium-item ${positionClass} ${rankClass}`}
              
              /* 기둥과 장식이 "뿅" 하고 튀어나오는 효과 */
              initial={{ opacity: 0, scale: 0.5, y: 50 }} 
              animate={{ 
                  opacity: 1, 
                  y: 0,
                  scale: index === 0 ? 1.1 : 0.9  // 약간의 원근감
              }}
              exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
              
              transition={{ 
                type: "spring", 
                stiffness: 400, 
                damping: 25,
                mass: 1 
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
                    style={{cursor: 'pointer'}}
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