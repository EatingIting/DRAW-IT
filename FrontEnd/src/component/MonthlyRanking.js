import { useEffect, useState } from 'react';
import './MonthlyRanking.css';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const MonthlyRanking = () => {
  const [imgs, setImgs] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [targetDate, setTargetDate] = useState(new Date());
  const [titleDate, setTitleDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  
  const top3Data = imgs.slice(0, 3).filter(item => item);
  const restImgs = imgs.length > 3 ? imgs.slice(3) : [];

  const maxScore = imgs[0]?.rec || 1; 
  const maxPixelHeight = 250;

  useEffect(() => {
    (async() => {
      setIsLoading(true);
      setImgs([]); 
      try {
        const fullYear = targetDate.getFullYear();
        const year = String(fullYear).slice(-2); 
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
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
        setImgs([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [targetDate]);

  const handleClick = async (id) => {
    if (isLocked) return;
    try{
      const nextImgs = imgs.map((img) =>
        img.id === id ? { ...img, rec: img.rec + 1} : img
      );
      const sortedNextImgs = [...nextImgs].sort((a, b) => b.rec - a.rec);
      const currentOrder = imgs.map(img => img.id).join(',');
      const nextOrder = sortedNextImgs.map(img => img.id).join(',');
      
      if (currentOrder !== nextOrder) {
        setIsLocked(true);
        setTimeout(() => setIsLocked(false), 1000); 
      }
      await axios.post(`http://localhost:8080/monRnk/increaseRec/${id}`);
      setImgs(sortedNextImgs);
    } catch(error){
      console.log("추천 업데이트 실패: ", error);
    }
  }

  const changeMonth = (offset) => {
    if (isLocked) return;
    setTargetDate((prevDate) => {
      const newDate = new Date(prevDate);
      newDate.setMonth(newDate.getMonth() + offset);
      return newDate;
    });
  };

  const hasData = imgs.length > 0;

  return (
    <div className={`ranking-container ${isLocked ? 'click-locked' : ''}`}>
      <button className="nav-btn prev-btn" onClick={() => changeMonth(-1)}>◀</button>
      <button className="nav-btn next-btn" onClick={() => changeMonth(1)}>▶</button>
      
      {/* ✨ podium-section은 항상 존재 (공간 확보) 
         데이터가 있으면 기둥 3개를, 없으면 404 텍스트를 띄움
      */}
      <motion.div className="podium-section" layout>
        <AnimatePresence mode='wait'>
          {hasData ? (
            // 데이터가 있을 때: 기존 Podium 로직
            top3Data.map((img, index) => {
              let positionClass = '';
              let rankClass = '';
              let rankNum = index + 1;
              let rankSuffix = rankNum === 1 ? 'st' : rankNum === 2 ? 'nd' : 'rd';

              const isFirst = index === 0;
              const itemWidth = isFirst ? 320 : 280;

              if (index === 0) { positionClass = 'pos-center'; rankClass = 'first'; } 
              else if (index === 1) { positionClass = 'pos-left'; rankClass = 'second'; } 
              else { positionClass = 'pos-right'; rankClass = 'third'; }

              let calculatedHeight = (img.rec / maxScore) * maxPixelHeight;
              calculatedHeight = Math.max(130, calculatedHeight);
              let pillarDelay = index === 1 ? 0 : index === 2 ? 0.4 : 0.8;

              return (
                <motion.div 
                  key={img.id}
                  layout 
                  className={`podium-item ${positionClass} ${rankClass}`}
                  style={{ 
                    width: `${itemWidth}px`, 
                    marginLeft: `-${itemWidth / 2}px`,
                    zIndex: isFirst ? 20 : 5 
                  }}
                >
                  <div className="img-wrapper">
                      <motion.img 
                        layoutId={img.id} 
                        src={img.url} 
                        alt={img.topic} 
                        className="ranking-img halo-active"
                        onClick={() => handleClick(img.id)}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        whileHover={{ scale: 1.15, rotate: -5 }} 
                        whileTap={{ scale: 1.15, rotate: [0, -5, 5, -5, 0], transition: { rotate: { type: "tween", duration: 0.4 } } }}
                        style={{
                            cursor: 'pointer',
                            width: isFirst ? '240px' : '200px',
                            height: isFirst ? '240px' : '200px'
                        }}
                      />
                  </div>
                  <motion.div 
                    className="pillar" 
                    initial={{ height: 0 }}
                    animate={{ height: calculatedHeight }}
                    transition={{ delay: pillarDelay, duration: 0.5, ease: "easeOut" }}
                    layout 
                  >
                    <div className="snow-cap"><div className="img-topic">{img.topic}</div></div> 
                    <div className="ribbon"></div>
                    <span className="rank-text">{rankNum}{rankSuffix}</span>
                    <motion.span key={img.rec} className="recommend">{img.rec}</motion.span>
                  </motion.div>
                </motion.div>
              );
            })
          ) : (
             // ✨ 데이터가 없을 때: 404 메시지 (로딩중이 아닐 때만)
             !isLoading && (
              <motion.div 
                key="not-found"
                className="not-found-message"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
              >
                404: ART NOT FOUND
              </motion.div>
             )
          )}
        </AnimatePresence>
      </motion.div>

      {/* 명예의 전당 타이틀 (항상 표시, 위치 고정) */}
      <div className="hall-of-fame-title">
        {titleDate} <br/>명예의 전당
      </div>

      {/* 리스트 섹션 (데이터가 있을 때만 표시) */}
      {hasData && (
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
                exit={{ opacity: 0, scale: 0.8 }} 
              >
                 <motion.img 
                    layoutId={img.id}
                    src={img.url} 
                    alt={img.topic} 
                    className="list-avatar" 
                    onClick={() => handleClick(img.id)} 
                    whileHover={{ scale: 1.15, rotate: -5 }}
                    whileTap={{ scale: 1.15, rotate: [0, -5, 5, -5, 0] }}
                 />
                 <div className="list-topic">{img.topic}</div>
                 <div className="list-rec">{img.rec}</div>
              </motion.div>
            ))}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default MonthlyRanking;