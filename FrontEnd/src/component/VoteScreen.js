import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../api/config';
import './VoteScreen.css';

const VoteScreen = () => {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [players, setPlayers] = useState(location.state?.players || []);
  const [images, setImages] = useState([]);
  
  // 현재 내가 투표한 그림의 index (없으면 null)
  const [myVote, setMyVote] = useState(null);

  useEffect(() => {
    if (!lobbyId) return;

    const fetchVoteData = async () => {
      try {
        const galleryRes = await axios.get(`${API_BASE_URL}/api/game/${lobbyId}/gallery`);
        
        // 데이터 초기화: voteCount가 없으면 0으로 설정
        const initializedData = galleryRes.data.map(img => ({
            ...img,
            voteCount: img.voteCount || 0 
        }));
        
        setImages(initializedData);

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

  const formatSubject = (filename) => {
    if (!filename) return "Unknown";
    return filename.replace(/\.[^/.]+$/, "");
  };

  // 🔥 [핵심 로직 수정] 1인 1투표 (이동 가능)
  const handleVote = (index) => {
    // 이미 투표한 것을 다시 누르면 아무것도 안 함 (혹은 취소 로직을 넣을 수도 있음)
    if (myVote === index) return;

    setImages(prevImages => {
        const newImages = [...prevImages];

        // 1. 이전에 투표한 것이 있다면 -> 투표 수 회수 (-1)
        if (myVote !== null) {
            const prevImg = newImages[myVote];
            newImages[myVote] = {
                ...prevImg,
                // 0보다 작아지지 않게 방어 코드
                voteCount: Math.max(0, (prevImg.voteCount || 0) - 1)
            };
        }

        // 2. 새로 선택한 것 -> 투표 수 추가 (+1)
        const newImg = newImages[index];
        newImages[index] = {
            ...newImg,
            voteCount: (newImg.voteCount || 0) + 1
        };

        return newImages;
    });

    // 3. 내 투표 상태 업데이트
    setMyVote(index);

    console.log(`투표 이동: ${myVote}번 -> ${index}번`);
    
    // TODO: 백엔드 연동 시
    // axios.post(..., { prevVote: myVote, newVote: index }) 
    // 형태로 보내서 서버 DB도 업데이트하고, 소켓으로 다른 사람들에게도 전파해야 함.
  };

  // 투표 수만큼 엄지척 아이콘 렌더링
  const renderThumbs = (count) => {
    return Array.from({ length: count }).map((_, i) => (
        <span key={i} className="thumb-icon" style={{ animationDelay: `${i * 0.05}s` }}>
            👍
        </span>
    ));
  };

  return (
    <div className="vote-screen-container">
      
      <h1 className="vote-title">
        The Art of The Match
      </h1>
      
      <div className="gallery-container-frame">
        <div className="gallery-grid">
          {images.map((img, idx) => {
            const isSelected = myVote === idx;

            return (
              <div 
                key={idx} 
                className={`gallery-card ${isSelected ? 'selected' : ''}`}
                onClick={() => handleVote(idx)}
              >
                {/* 엄지척 스택 (투표 수만큼 표시) */}
                <div className="vote-stack">
                    {renderThumbs(img.voteCount || 0)}
                </div>

                <img 
                  src={img.imageUrl} 
                  alt={img.keyword} 
                  className="gallery-image"
                />
                <div className="card-info">
                    <p className="card-nickname">
                      {formatSubject(img.nickname)}
                    </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="score-section">
        <h3 className="score-title">🏆 최종 점수</h3>
        {players.length > 0 ? (
            <ul className="score-list">
            {players.map((p, index) => (
                <li key={p.userId || index} className="score-item">
                {p.nickname} : <span className="score-point">{p.score || 0} 점</span>
                </li>
            ))}
            </ul>
        ) : (
            <p>점수 정보를 불러올 수 없습니다.</p>
        )}
      </div>
      
      <button onClick={() => navigate('/')} className="home-button">
        메인으로 돌아가기
      </button>
    </div>
  );
};

export default VoteScreen;