import { useEffect, useState } from 'react';
import './MonthlyRanking.css';
import axios from 'axios';
import { matchPath } from 'react-router-dom';

const MonthlyRanking = () => {
  const [imgs, setImgs] = useState([]);
  
  // 1,2,3등과 나머지 분리
  const top3 = imgs.length > 0 ? [imgs[1], imgs[0], imgs[2]] : []; 
  const restImgs = imgs.length > 3 ? imgs.slice(3) : [];

  // ✨ 1등의 점수 (비율 계산의 기준점)
  // top3[1]이 1등입니다. 데이터가 없으면 1로 설정하여 0 나누기 방지
  const maxScore = top3[1]?.rec || 1; 
  
  // ✨ 1등의 고정 높이 설정 (예: 250px)
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
        setImgs(mappedData);

        console.log(response.data);
        
      } catch (error) {
        console.error("통신 에러:", error);
      }
    })();
  }, []);

  const handleClick = async (id) => {
    try{
      await axios.post(`http://localhost:8080/monRnk/increaseRec/${id}`);

      setImgs((prev) => {
        const newImgs = prev.map((img) =>
          img.id === id ? { ...img, rec: img.rec + 1} : img
        );

        return newImgs.sort((a, b) => b.rec - a.rec);
      })
    }catch(error){
      console.log("추천 업데이트 실패: ", error);
      
    }
  }

  return (
    <div className="ranking-container">
      <div className="podium-section">
        {top3.map((img, index) => {
          if(!img) return null;

          let rank = 0;
          let rankClass = '';
          if (index === 0) { rank = 2; rankClass = 'second'; }
          else if (index === 1) { rank = 1; rankClass = 'first'; }
          else { rank = 3; rankClass = 'third'; }

          // ✨ 높이 동적 계산 로직
          // (내 점수 / 1등 점수) * 최대 높이
          let calculatedHeight = (img.rec / maxScore) * maxPixelHeight;
          
          // ✨ 최소 높이 보장 (글씨가 잘리지 않게 최소 80px은 확보)
          calculatedHeight = Math.max(130, calculatedHeight);

          return (
            <div key={img.id} className={`podium-item ${rankClass}`}>
              
              {/* === 변경된 부분: 래퍼 제거 및 클래스명 변경 === */}
              <div className="img-wrapper">
                  <img 
                    src={img.url} 
                    alt={img.topic} 
                    className="ranking-img" 
                    onClick={() => handleClick(img.id)}
                    style={{cursor: 'pointer'}}/>
                  <span className="rank-badge">{rank}</span>
              </div>
              
              {/* 기둥 (솟아오르는 부분) */}
              <div 
                className="pillar" 
                style={{ '--final-height': `${calculatedHeight}px` }}
              >
                <div className="snow-cap">
                  <div className="img-topic">{img.topic}</div>
                </div> 
                <div className="ribbon"></div>
                <span className="rank-text">{rank}st</span>
                <span className="recommend">{img.rec}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* --- 하단: 나머지 리스트 (Grid) --- */}
      <div className="list-section">
        <div className="grid-container">
          {restImgs.map((img, index) => (
            <div key={img.id} className="grid-item">
              <img 
                src={img.url} 
                alt={img.topic} 
                className="list-avatar" 
                onClick={() => handleClick(img.id)}
                style={{cursor: "pointer"}}/>
              <div className="list-topic">{img.topic}</div>
              <div className="list-rank">{index + 4}위</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MonthlyRanking;