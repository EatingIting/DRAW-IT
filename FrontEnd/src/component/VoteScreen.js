import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { API_BASE_URL } from '../api/config';
import './VoteScreen.css';

// 숫자가 0에서 target까지 올라가는 컴포넌트
const CountUp = ({ target, duration = 1500 }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime;
    let animationFrame;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const progressRatio = Math.min(progress / duration, 1);
      
      const easeOut = 1 - Math.pow(2, -10 * progressRatio);
      
      setCount(Math.floor(target * easeOut));

      if (progress < duration) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setCount(target);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [target, duration]);

  return <span className="score-point">{count} 점</span>;
};

// 폭죽 컴포넌트
const ConfettiExplosion = () => {
  const particles = Array.from({ length: 20 });
  return (
    <div className="confetti-container">
      {particles.map((_, i) => (
        <div key={i} className={`confetti-particle p${i}`}></div>
      ))}
    </div>
  );
};

const VoteScreen = () => {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [players, setPlayers] = useState(location.state?.players || []);
  const [images, setImages] = useState([]);
  const [myVote, setMyVote] = useState(null);

  // 타이머 및 상태 관리
  const [timeLeft, setTimeLeft] = useState(30); 
  const [isVotingDisabled, setIsVotingDisabled] = useState(false);

  // 결과 화면 관련 상태
  const [showResults, setShowResults] = useState(false); 
  const [rankedPlayers, setRankedPlayers] = useState([]); 
  
  // 🔥 [수정 1] 리스트 배열 대신 '몇 명 보여줄지' 숫자로 관리 (중복 키 에러 해결의 핵심)
  const [visibleCount, setVisibleCount] = useState(0);
  
  const [showHomeButton, setShowHomeButton] = useState(false); 

  const stompClientRef = useRef(null);
  const myUserId = useRef("user_" + Math.random().toString(36).substr(2, 9)).current;
  const imagesRef = useRef([]); 

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // 타이머 로직
  useEffect(() => {
    if (timeLeft <= 0) {
      if (!isVotingDisabled) {
        setIsVotingDisabled(true);
        calculateAndShowResults();
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const calculateAndShowResults = () => {
    const currentImages = imagesRef.current;
    
    // 이미지 투표수 내림차순 정렬
    const sortedImages = [...currentImages].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));

    // 보너스 점수 매핑 (1등: 75, 2등: 50, 3등: 25)
    const bonusMap = {};
    if (sortedImages.length > 0) bonusMap[sortedImages[0].userId] = 75; 
    if (sortedImages.length > 1) bonusMap[sortedImages[1].userId] = 50; 
    if (sortedImages.length > 2) bonusMap[sortedImages[2].userId] = 25; 

    // 🔥 [수정 2] 플레이어 중복 제거 (방어 코드)
    // userId가 같은 유저가 여러 번 들어있는 경우를 대비해 Map으로 유니크하게 필터링
    const uniquePlayers = Array.from(
        new Map(players.map(p => [p.userId, p])).values()
    );

    const updatedPlayers = uniquePlayers.map(p => {
      const bonus = bonusMap[p.userId] || 0;
      return {
        ...p,
        totalScore: (p.score || 0) + bonus,
        bonus: bonus
      };
    });

    // 최종 점수 내림차순 정렬
    updatedPlayers.sort((a, b) => b.totalScore - a.totalScore);

    setRankedPlayers(updatedPlayers);
    setShowResults(true); 
  };

  // 🔥 [수정 3] 순차적 랭킹 공개 애니메이션 로직 변경 (visibleCount 증가 방식)
  useEffect(() => {
    if (!showResults || rankedPlayers.length === 0) return;

    // 인터벌을 통해 visibleCount를 1씩 증가시킴
    const interval = setInterval(() => {
      setVisibleCount(prevCount => {
        // 모든 플레이어를 다 보여줬다면 종료
        if (prevCount >= rankedPlayers.length) {
          clearInterval(interval);
          setTimeout(() => setShowHomeButton(true), 1000);
          return prevCount;
        }
        return prevCount + 1; // 하나 더 보여줌
      });
    }, 1500); // 1.5초 간격

    return () => clearInterval(interval);
  }, [showResults, rankedPlayers]);

  // 데이터 로딩 및 소켓 연결
  useEffect(() => {
    if (!lobbyId) return;

    const fetchVoteData = async () => {
      try {
        const galleryRes = await axios.get(`${API_BASE_URL}/api/game/${lobbyId}/gallery`);
        const initializedData = galleryRes.data.map(img => ({
            ...img,
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
      debug: () => {},
      onConnect: () => {
        console.log('✅ 투표 소켓 연결 성공!');
        client.subscribe(`/topic/vote/${lobbyId}`, (message) => {
          if (message.body) {
            const voteCounts = JSON.parse(message.body);
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
      if (stompClientRef.current) stompClientRef.current.deactivate();
    };
  }, [lobbyId]);

  const handleVote = (index) => {
    if (isVotingDisabled) return;
    if (myVote === index) return;
    setMyVote(index);

    if (stompClientRef.current && stompClientRef.current.connected) {
        stompClientRef.current.publish({
            destination: `/app/vote/${lobbyId}`,
            body: JSON.stringify({ voteIndex: index, userId: myUserId }),
        });
    }
  };

  const renderThumbs = (count) => {
    return Array.from({ length: count }).map((_, i) => (
        <span key={i} className="thumb-icon" style={{ animationDelay: `${i * 0.05}s`, '--rotate': `${i % 2 === 0 ? 15 : -15}deg` }}>
            👍
        </span>
    ));
  };

  return (
    <div className="vote-screen-container">
      <h1 className="vote-title">The Art of The Match</h1>

      <div className="timer-wrapper">
        <div className="timer-text">
          {timeLeft > 0 ? `투표 종료까지 ${timeLeft}초` : "투표 종료! 결과 집계 중..."}
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
            const imageSrc = img.imageUrl.startsWith('http') ? img.imageUrl : `${API_BASE_URL}${img.imageUrl}`;
            const subjectText = img.keyword || "Unknown";

            return (
              <div 
                key={idx} 
                className={`gallery-card ${isSelected ? 'selected' : ''} ${isVotingDisabled ? 'disabled' : ''}`}
                onClick={() => handleVote(idx)}
              >
                <div className="vote-stack">
                    {renderThumbs(img.voteCount || 0)}
                </div>
                <img src={imageSrc} alt={subjectText} className="gallery-image" />
                <div className="card-info">
                    <p className="card-nickname">{subjectText}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showResults && (
        <div className="score-section visible">
          <h3 className="score-title">🏆 최종 순위</h3>
          <ul className="score-list">
            {/* 🔥 [수정 4] visibleCount 만큼만 잘라서 렌더링 (중복 키 발생 원천 차단) */}
            {rankedPlayers.slice(0, visibleCount).map((p, index) => {
              const isTop3 = index < 3;
              
              return (
                <li key={p.userId} className={`score-item rank-${index + 1}`}>
                  {isTop3 && <ConfettiExplosion />}
                  
                  <span className="rank-badge">{index + 1}위</span>
                  <span className="player-name">{p.nickname}</span>
                  <div className="score-container">
                    <CountUp target={p.totalScore || 0} />
                    {p.bonus > 0 && <span className="bonus-text">(+{p.bonus})</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      
      {showHomeButton && (
        <button onClick={() => navigate('/')} className="home-button boing-enter">
          메인으로 돌아가기
        </button>
      )}
    </div>
  );
};

export default VoteScreen;