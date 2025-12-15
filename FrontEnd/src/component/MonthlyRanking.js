import './MonthlyRanking.css';

// 더미 데이터 (실제 데이터로 교체하세요)
const users = [
  { id: 1, name: '산타할비', score: 100, avatar: '🎅' }, // 1등
  { id: 2, name: '루돌프', score: 90, avatar: '🦌' },   // 2등
  { id: 3, name: '눈사람', score: 85, avatar: '⛄' },   // 3등
  { id: 4, name: '쿠키맨', score: 80, avatar: '🍪' },
  { id: 5, name: '요정1', score: 75, avatar: '🧝' },
  { id: 6, name: '요정2', score: 70, avatar: '🧝‍♀️' },
  { id: 7, name: '펭귄', score: 65, avatar: '🐧' },
  { id: 8, name: '북극곰', score: 60, avatar: '🐻‍❄️' },
];

const ChristmasRanking = () => {
  // 1,2,3등과 나머지 분리
  const top3 = [users[1], users[0], users[2]]; // 순서 중요: [2등, 1등, 3등] 배치
  const restUsers = users.slice(3);

  return (
    <div className="ranking-container">
      {/* --- 상단: 시상대 (Podium) --- */}
      <div className="podium-section">
        {top3.map((user, index) => {
          // 순위에 따른 클래스 및 랭크 설정 (배열 인덱스 0은 2등, 1은 1등, 2는 3등)
          let rank = 0;
          let rankClass = '';
          if (index === 0) { rank = 2; rankClass = 'second'; }
          else if (index === 1) { rank = 1; rankClass = 'first'; }
          else { rank = 3; rankClass = 'third'; }

          return (
            <div key={user.id} className={`podium-item ${rankClass}`}>
              {/* 캐릭터 (애니메이션 딜레이 적용) */}
              <div className="avatar-wrapper">
                <div className="avatar-circle">
                    {/* 이미지 태그 대신 이모지 사용 (실제론 <img src={user.image} />) */}
                    <span className="avatar-img">{user.avatar}</span> 
                    <span className="rank-badge">{rank}</span>
                </div>
                <div className="user-name">{user.name}</div>
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
          {restUsers.map((user, index) => (
            <div key={user.id} className="grid-item">
              <div className="list-avatar">{user.avatar}</div>
              <div className="list-name">{user.name}</div>
              <div className="list-rank">{index + 4}위</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChristmasRanking;