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

  // 🔥 [추가] 타이머 및 투표 활성화 상태 관리
  const [timeLeft, setTimeLeft] = useState(30); // 30초 카운트다운
  const [isVotingDisabled, setIsVotingDisabled] = useState(false);

  const stompClientRef = useRef(null);
  const myUserId = useRef("user_" + Math.random().toString(36).substr(2, 9)).current;

  // 🔥 [추가] 타이머 로직
  useEffect(() => {
    if (timeLeft <= 0) {
      setIsVotingDisabled(true); // 0초 되면 투표 비활성화
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    if (!lobbyId) return;

    const fetchVoteData = async () => {
      try {
        const galleryRes = await axios.get(`${API_BASE_URL}/api/game/${lobbyId}/gallery`);
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
      debug: (str) => {
         // console.log(str);
      },
      onConnect: () => {
        console.log('✅ 투표 소켓 연결 성공!');
        client.subscribe(`/topic/vote/${lobbyId}`, (message) => {
          if (message.body) {
            const voteCounts = JSON.parse(message.body);
            console.log("📩 투표 현황 수신:", voteCounts);
            setImages(prevImages => {
                return prevImages.map((img, idx) => ({
                    ...img,
                    voteCount: voteCounts[idx] !== undefined ? voteCounts[idx] : img.voteCount
                }));
            });
          }
        });
      },
      onStompError: (frame) => {
        console.error('소켓 에러:', frame.headers['message']);
      },
    });

    client.activate();
    stompClientRef.current = client;

    return () => {
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
      }
    };
  }, [lobbyId]);

  const handleVote = (index) => {
    // 🔥 [수정] 투표 비활성화 상태면 함수 종료 (클릭 무시)
    if (isVotingDisabled) return;

    if (myVote === index) return;
    setMyVote(index);

    if (stompClientRef.current && stompClientRef.current.connected) {
        stompClientRef.current.publish({
            destination: `/app/vote/${lobbyId}`,
            body: JSON.stringify({ 
                voteIndex: index,
                userId: myUserId 
            }),
        });
    }
  };

  const renderThumbs = (count) => {
    return Array.from({ length: count }).map((_, i) => (
        <span key={i} className="thumb-icon" style={{ animationDelay: `${i * 0.05}s` }}>
            👍
        </span>
    ));
  };

  return (
    <div className="vote-screen-container">
      <h1 className="vote-title">The Art of The Match</h1>

      {/* 🔥 [추가] 타이머 UI */}
      <div className="timer-wrapper">
        <div className="timer-text">
          {timeLeft > 0 ? `투표 종료까지 ${timeLeft}초` : "투표가 종료되었습니다!"}
        </div>
        <div className="timer-bar-container">
          <div 
            className="timer-bar-fill" 
            style={{ width: `${(timeLeft / 30) * 100}%` }}
          ></div>
        </div>
      </div>
      
      <div className="gallery-container-frame">
        <div className="gallery-grid">
          {images.map((img, idx) => {
            const isSelected = myVote === idx;
            
            const imageSrc = img.imageUrl.startsWith('http') 
              ? img.imageUrl 
              : `${API_BASE_URL}${img.imageUrl}`;

            const subjectText = img.keyword || "Unknown";

            return (
              <div 
                key={idx} 
                className={`gallery-card ${isSelected ? 'selected' : ''}`}
                // 투표가 끝났으면 클릭 이벤트 핸들러 자체를 제거하지 않고
                // 내부 로직에서 막거나, cursor 스타일을 변경하여 시각적 피드백 제공
                onClick={() => handleVote(idx)}
                style={{ cursor: isVotingDisabled ? 'default' : 'pointer' }}
              >
                <div className="vote-stack">
                    {renderThumbs(img.voteCount || 0)}
                </div>
                <img 
                  src={imageSrc} 
                  alt={subjectText}
                  className="gallery-image"
                />
                <div className="card-info">
                    <p className="card-nickname">
                      {subjectText}
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