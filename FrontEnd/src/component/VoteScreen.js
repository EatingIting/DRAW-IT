import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../api/config';

const VoteScreen = () => {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // 점수 데이터 (GameScreen에서 넘겨받은 값 사용)
  const [players, setPlayers] = useState(location.state?.players || []);
  const [images, setImages] = useState([]);

  useEffect(() => {
    if (!lobbyId) return;

    const fetchVoteData = async () => {
      try {
        // 백엔드에서 이미 URL이 완성된 데이터를 받아옴
        const galleryRes = await axios.get(`${API_BASE_URL}/api/game/${lobbyId}/gallery`);
        const galleryData = galleryRes.data;
        
        console.log("📸 받아온 갤러리 데이터:", galleryData); 
        setImages(galleryData);

        // (서버 재시작 대비용 백업 로직 - 필요 시 유지)
        if (players.length === 0) {
            try {
                const lobbyRes = await axios.get(`${API_BASE_URL}/lobby/${lobbyId}`);
                const lobbyData = lobbyRes.data.lobby || lobbyRes.data;
                setPlayers(lobbyData.users || []);
            } catch(e) {
                console.warn("로비 정보 소실(정상)");
            }
        }

      } catch (err) {
        console.error("데이터 로딩 실패:", err);
      }
    };

    fetchVoteData();
  }, [lobbyId]);

  return (
    <div className="vote-screen-container" style={{ padding: '20px', textAlign: 'center', color: 'black' }}>
      <h1>투표 화면</h1>
      
      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '20px', flexWrap: 'wrap' }}>
        {images.map((img, idx) => (
            <div key={idx} style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '8px', background: '#fff', maxWidth: '220px' }}>
              
              {/* 🔥 [변경] 이제 백엔드가 준 img.imageUrl만 믿고 넣으면 됩니다! */}
              <img 
                src={img.imageUrl} 
                alt={img.keyword} 
                style={{ width: '200px', height: '150px', objectFit: 'contain', border: '1px solid #eee' }} 
              />
              
              <div style={{marginTop: '10px'}}>
                  <p><strong>{img.nickname}</strong></p>
                  <p style={{fontSize: '0.9em', color: '#666'}}>주제어: {img.keyword}</p>
              </div>
            </div>
        ))}
      </div>

      <div style={{ marginTop: '30px' }}>
        <h3>🏆 최종 점수</h3>
        {players.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0 }}>
            {players.map((p, index) => (
                <li key={p.userId || index} style={{ fontSize: '1.2rem', margin: '5px 0' }}>
                {p.nickname} : <span style={{ color: 'blue', fontWeight: 'bold' }}>{p.score || 0}</span> 점
                </li>
            ))}
            </ul>
        ) : (
            <p>점수 정보를 불러올 수 없습니다.</p>
        )}
      </div>
      
      <button onClick={() => navigate('/')} style={{marginTop: '30px', padding: '10px 20px'}}>
        메인으로 돌아가기
      </button>
    </div>
  );
};

export default VoteScreen;