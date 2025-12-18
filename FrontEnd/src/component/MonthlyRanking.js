import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef, useCallback } from 'react'; // useRef, useCallback 추가
import './MonthlyRanking.css';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const MonthlyRanking = () => {
  const [imgs, setImgs] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [targetDate, setTargetDate] = useState(new Date());
  const [titleDate, setTitleDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 페이지네이션 관련 상태
  const [page, setPage] = useState(0); 
  const [hasMore, setHasMore] = useState(true); // 더 가져올 데이터가 있는지 확인
  const observerRef = useRef(); // 스크롤 감지용 ref

  const navigate = useNavigate();
  
  // 렌더링용 데이터 분리
  const top3Data = imgs.slice(0, 3).filter(item => item);
  const restImgs = imgs.length > 3 ? imgs.slice(3) : [];

  const maxScore = imgs[0]?.rec || 1; 
  const maxPixelHeight = 250;

  // 1. 날짜가 변경되면 데이터를 초기화하고 페이지를 0으로 리셋
  useEffect(() => {
    const fullYear = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    setTitleDate(`${fullYear}.${month}`);
    
    setImgs([]);
    setPage(0);
    setHasMore(true);
    // page가 0으로 바뀌면서 아래 fetch useEffect가 트리거 됩니다.
  }, [targetDate]);

  // 2. 데이터 페칭 (페이지가 바뀌거나 날짜가 바뀌었을 때)
  useEffect(() => {
    const fetchImages = async () => {
      if (!hasMore && page > 0) return; // 더 없으면 요청 안함

      setIsLoading(true);
      try {
        const fullYear = targetDate.getFullYear();
        const year = String(fullYear).slice(-2); 
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const yyMM = `${year}${month}`;

        // page와 size 파라미터 전달 (size는 8로 고정)
        // 첫 페이지는 Top3 + 5개 리스트 = 8개
        const response = await axios.get(`http://localhost:8080/monRnk/getMonRnk/${yyMM}`, {
          params: { page: page, size: 8 }
        });

        const mappedData = response.data.map((item) => ({
          id: item.imgId,
          topic: item.topic,
          rec: item.recommend,
          url: item.imgUrl
        }));

        // 데이터가 비었거나 요청한 size보다 적으면 마지막 페이지임
        if (mappedData.length === 0 || mappedData.length < 8) {
          setHasMore(false);
        }

        setImgs((prev) => {
          // 페이지가 0이면 새로 덮어쓰기, 아니면 기존 데이터 뒤에 붙이기
          if (page === 0) return mappedData.sort((a, b) => b.rec - a.rec);
          
          // 기존 데이터와 합치고 다시 정렬 (점수 변동 고려)
          const newImgs = [...prev, ...mappedData];
          // 중복 제거 (혹시 모를 중복 방지)
          const uniqueImgs = newImgs.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
          return uniqueImgs.sort((a, b) => b.rec - a.rec);
        });

      } catch (error) {
        console.error("통신 에러:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchImages();
  }, [page, targetDate]); // page나 targetDate가 변하면 실행

  // 3. 무한 스크롤 옵저버 로직
  const lastElementRef = useCallback((node) => {
    if (isLoading) return; // 로딩 중이면 무시
    if (observerRef.current) observerRef.current.disconnect(); // 기존 옵저버 해제

    observerRef.current = new IntersectionObserver((entries) => {
      // 타겟이 보이고, 더 불러올 데이터가 있다면 페이지 증가
      if (entries[0].isIntersecting && hasMore) {
        setPage((prevPage) => prevPage + 1);
      }
    });

    if (node) observerRef.current.observe(node);
  }, [isLoading, hasMore]);


  const handleClick = async (id) => {
    if (isLocked) return;
    try{
      const nextImgs = imgs.map((img) =>
        img.id === id ? { ...img, rec: img.rec + 1} : img
      );
      // 로컬 업데이트 시 전체 재정렬 (페이지네이션 된 상태에서도 순서는 유지됨)
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

      <button className="back-btn" onClick={() => {navigate(-1);}}>
         <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
         </svg>
      </button>
      
      <button className="nav-btn prev-btn" onClick={() => changeMonth(-1)}>◀</button>
      <button className="nav-btn next-btn" onClick={() => changeMonth(1)}>▶</button>
      
      <motion.div className="podium-section" layout>
        <AnimatePresence mode='wait'>
          {hasData ? (
            top3Data.map((img, index) => {
              // ... 기존 Podium 렌더링 로직 (그대로 유지) ...
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
                  key={img.id} layout className={`podium-item ${positionClass} ${rankClass}`}
                  style={{ width: `${itemWidth}px`, marginLeft: `-${itemWidth / 2}px`, zIndex: isFirst ? 20 : 5 }}
                >
                  <div className="img-wrapper">
                      <motion.img 
                        layoutId={img.id} src={img.url} alt={img.topic} className="ranking-img halo-active"
                        onClick={() => handleClick(img.id)}
                        initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        whileHover={{ scale: 1.15, rotate: -5 }} 
                        whileTap={{ 
                          scale: 1.15, 
                          rotate: [0, -5, 5, -5, 0],
                          transition: {
                            rotate: { type: "tween", duration: 0.4, ease: "easeInOut" }, // 회전은 tween으로
                            scale: { type: "spring", stiffness: 200, damping: 20 }        // 크기는 spring으로
                          }
                        }}
                        style={{ cursor: 'pointer', width: isFirst ? '240px' : '200px', height: isFirst ? '240px' : '200px' }}
                      />
                  </div>
                  <motion.div className="pillar" initial={{ height: 0 }} animate={{ height: calculatedHeight }} transition={{ delay: pillarDelay, duration: 0.5 }} layout>
                    <div className="snow-cap"><div className="img-topic">{img.topic}</div></div> 
                    <div className="ribbon"></div>
                    <span className="rank-text">{rankNum}{rankSuffix}</span>
                    <motion.span key={img.rec} className="recommend">{img.rec}</motion.span>
                  </motion.div>
                </motion.div>
              );
            })
          ) : (
             !isLoading && (
              <motion.div key="not-found" className="not-found-message" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                404: ART NOT FOUND
              </motion.div>
             )
          )}
        </AnimatePresence>
      </motion.div>

      <div className="hall-of-fame-title">
        {titleDate} <br/>명예의 전당
      </div>

      {hasData && (
        <div className="list-section">
          <motion.div className="grid-container" layout>
            <AnimatePresence>
            {restImgs.map((img, index) => {
                // 마지막 요소인지 확인하여 ref 연결
                const isLastElement = index === restImgs.length - 1;
                return (
                  <motion.div 
                    ref={isLastElement ? lastElementRef : null} // 여기에 ref 연결
                    key={img.id} layout className="grid-item"
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }} 
                  >
                     <motion.img 
                        layoutId={img.id} src={img.url} alt={img.topic} className="list-avatar" 
                        onClick={() => handleClick(img.id)} 
                        whileHover={{ scale: 1.15, rotate: -5 }} 
                        whileTap={{ 
                          scale: 1.15, 
                          rotate: [0, -5, 5, -5, 0],
                          transition: {
                            rotate: { type: "tween", duration: 0.4, ease: "easeInOut" }, 
                            scale: { type: "spring", stiffness: 300, damping: 20 }
                          }
                        }}
                     />
                     <div className="list-topic">{img.topic}</div>
                     <div className="list-rec">{img.rec}</div>
                  </motion.div>
                );
            })}
            </AnimatePresence>
          </motion.div>
          
          {/* 로딩 인디케이터 */}
          {isLoading && <div className="loading-indicator" style={{textAlign: 'center', color: 'white', padding: '20px'}}>Loading more...</div>}
        </div>
      )}
    </div>
  );
};

export default MonthlyRanking;