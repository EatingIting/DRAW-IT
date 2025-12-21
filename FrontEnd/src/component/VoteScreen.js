import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { API_BASE_URL } from '../api/config';
import './VoteScreen.css';

const VoteScreen = () => {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [players, setPlayers] = useState(location.state?.players || []);
  const [images, setImages] = useState([]);
  const [myVote, setMyVote] = useState(null);

  const stompClientRef = useRef(null);
  const myUserId = useRef("user_" + Math.random().toString(36).substr(2, 9)).current;

  useEffect(() => {
    if (!lobbyId) return;

    const fetchVoteData = async () => {
      try {
        const galleryRes = await axios.get(`${API_BASE_URL}/api/game/${lobbyId}/gallery`);
        const initializedData = galleryRes.data.map(img => ({
            ...img,
            // 문자열 "0"일 수 있으므로 parseInt로 안전하게 변환
            voteCount: parseInt(img.voteCount || 0, 10)
        }));
        setImages(initializedData);

        if (players.length === 0) {
            try {
                const lobbyRes = await axios.get(`${API_BASE_URL}/lobby/${lobbyId}`);
                const lobbyData = lobbyRes.data.lobby || lobbyRes.data;
                setPlayers(lobbyData.users || []);
            } catch(e) {}
        }
      } catch (err) {
        console.error("데이터 로딩 실패:", err);
      }
    };
    fetchVoteData();

    const socket = new SockJS(`${API_BASE_URL}/ws-stomp`);
    const client = new Client({
      webSocketFactory: () => socket,
      onConnect: () => {
        console.log('✅ 투표 소켓 연결 성공!');
        client.subscribe(`/topic/vote/${lobbyId}`, (message) => {
          if (message.body) {
            const voteCounts = JSON.parse(message.body);
            console.log("📩 투표 현황 수신:", voteCounts);
            
            setImages(prevImages => {
                return prevImages.map((img, idx) => ({
                    ...img,
                    // 서버에서 온 값으로 덮어쓰기
                    voteCount: voteCounts[idx] !== undefined ? voteCounts[idx] : img.voteCount
                }));
            });
          }
        });
      },
      onStompError: (frame) => console.error('소켓 에러:', frame.headers['message']),
    });

    client.activate();
    stompClientRef.current = client;

    return () => {
      if (stompClientRef.current) stompClientRef.current.deactivate();
    };
  }, [lobbyId]);

  const handleVote = (index) => {
    if (myVote === index) return;
    setMyVote(index);

    if (stompClientRef.current && stompClientRef.current.connected) {
        stompClientRef.current.publish({
            destination: `/app/vote/${lobbyId}`,
            body: JSON.stringify({ voteIndex: index, userId: myUserId }),
        });
    }
  };

  // 🔥 [수정] CSS 변수(--rotate)를 직접 주입하여 지그재그 효과 적용
  const renderThumbs = (count) => {
    // 안전하게 숫자로 변환
    const numCount = parseInt(count || 0, 10);
    
    return Array.from({ length: numCount }).map((_, i) => {
        // 짝수는 15도, 홀수는 -15도 회전
        const rotateDeg = i % 2 === 0 ? 15 : -15;
        return (
            <span 
                key={i} 
                className="thumb-icon" 
                style={{ 
                    animationDelay: `${i * 0.05}s`,
                    '--rotate': `${rotateDeg}deg` // CSS에서 var(--rotate)로 사용
                }}
            >
                👍
            </span>
        );
    });
  };

  return (
    <div className="vote-screen-container">
      <h1 className="vote-title">The Art of The Match</h1>
      <div className="gallery-container-frame">
        <div className="gallery-grid">
          {images.map((img, idx) => {
            const isSelected = myVote === idx;
            const imageSrc = img.imageUrl.startsWith('http') ? img.imageUrl : `${API_BASE_URL}${img.imageUrl}`;
            const subjectText = img.keyword || "Unknown";

            return (
              <div 
                key={idx} 
                className={`gallery-card ${isSelected ? 'selected' : ''}`}
                onClick={() => handleVote(idx)}
              >
                <div className="vote-stack">
                    {renderThumbs(img.voteCount)}
                </div>
                <img src={imageSrc} alt={subjectText} className="gallery-image"/>
                <div className="card-info">
                    <p className="card-nickname">{subjectText}</p>
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
        ) : (<p>점수 정보를 불러올 수 없습니다.</p>)}
      </div>
      <button onClick={() => navigate('/')} className="home-button">메인으로 돌아가기</button>
    </div>
  );
};

export default VoteScreen;