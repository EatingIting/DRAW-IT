import { useEffect, useState } from 'react';
import './MonthlyRanking.css';
import axios from 'axios';


const MonthlyRanking = () => {
  const [imgs, setImgs] = useState([]);
  // 1,2,3등과 나머지 분리
  const top3 = imgs.length > 0 ? [imgs[1], imgs[0], imgs[2]] : []; // 순서 중요: [2등, 1등, 3등] 배치
  const restImgs = imgs.length > 3 ? imgs.slice(3) : [];

  useEffect(() => {
    (async() => {
      try {
        let response = await axios.get("http://localhost:8080/getMonRnk");
        console.log("데이터 확인:", response.data);
        const mappedData = response.data.map((item) => ({
          id: item.imgId,
          topic: item.topic,
          rec: item.recommend,
          url: item.imgUrl
        }));

        setImgs(mappedData);
      } catch (error) {
        console.error("통신 에러:", error);
      }
    })();
  }, []);

  return (
    <div className="ranking-container">
      {/* --- 상단: 시상대 (Podium) --- */}
      <div className="podium-section">
        {top3.map((img, index) => {
          if(!img) return null;

          // 순위에 따른 클래스 및 랭크 설정 (배열 인덱스 0은 2등, 1은 1등, 2는 3등)
          let rank = 0;
          let rankClass = '';
          if (index === 0) { rank = 2; rankClass = 'second'; }
          else if (index === 1) { rank = 1; rankClass = 'first'; }
          else { rank = 3; rankClass = 'third'; }

          return (
            <div key={img.id} className={`podium-item ${rankClass}`}>
              {/* 캐릭터 (애니메이션 딜레이 적용) */}
              <div className="avatar-wrapper">
                <div className="avatar-circle">
                    {/* 이미지 태그 대신 이모지 사용 (실제론 <img src={img.imageUrl} />) */}
                    <img src={img.url} alt={img.imgId} className="avatar-img" />
                    <span className="rank-badge">{rank}</span>
                </div>
                <div className="img-topic">{img.topic}</div>
              </div>
              
              {/* 기둥 (솟아오르는 부분) */}
              <div className="pillar">
                <div className="snow-cap"></div> {/* 눈 효과 */}
                <div className="ribbon"></div>   {/* 리본 장식 */}
                <span className="rank-text">{rank}st</span>
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
              <img src={img.url} alt={img.topic} className="list-avatar" />
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