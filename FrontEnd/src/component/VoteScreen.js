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

  // ✅ [수정] 모든 키 저장소를 sessionStorage로 변경하기 위해 키 이름은 유지하되 저장소만 변경
  const VOTE_END_TIME_KEY = `voteEndTime_${lobbyId}`;
  const MY_VOTE_KEY = `myVote_${lobbyId}`;
  const FINAL_RESULTS_KEY = `finalResults_${lobbyId}`;
  const MY_USER_ID_KEY = `voteUserId_${lobbyId}`;

  const [players, setPlayers] = useState(location.state?.players || []);
  const [images, setImages] = useState([]);

  // ✅ [수정] sessionStorage 사용 (탭별로 ID 격리, 새로고침 시 유지)
  const [myUserId] = useState(() => {
    const savedId = sessionStorage.getItem(MY_USER_ID_KEY);
    if (savedId) return savedId;

    const newId = "user_" + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem(MY_USER_ID_KEY, newId);
    return newId;
  });

  // 투표 상태 초기화
  const [myVote, setMyVote] = useState(() => {
    const savedVote = sessionStorage.getItem(MY_VOTE_KEY);
    return savedVote !== null ? parseInt(savedVote, 10) : null;
  });

  // 타이머 초기화
  const [timeLeft, setTimeLeft] = useState(() => {
    const savedEndTime = sessionStorage.getItem(VOTE_END_TIME_KEY);
    if (savedEndTime) {
      const remaining = Math.floor((parseInt(savedEndTime, 10) - Date.now()) / 1000);
      return remaining > 0 ? remaining : 0;
    }
    return 30; // 기본값
  });

  // 결과 화면 상태 초기화
  const [showResults, setShowResults] = useState(() => {
    return !!sessionStorage.getItem(FINAL_RESULTS_KEY);
  });

  const [isVotingDisabled, setIsVotingDisabled] = useState(() => {
    return !!sessionStorage.getItem(FINAL_RESULTS_KEY);
  });

  const [rankedPlayers, setRankedPlayers] = useState(() => {
    const savedResults = sessionStorage.getItem(FINAL_RESULTS_KEY);
    return savedResults ? JSON.parse(savedResults) : [];
  });

  const [visibleCount, setVisibleCount] = useState(0);
  const [showHomeButton, setShowHomeButton] = useState(false); 

  const stompClientRef = useRef(null);
  const imagesRef = useRef([]); 

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    if (!sessionStorage.getItem(VOTE_END_TIME_KEY)) {
      const endTime = Date.now() + 30 * 1000;
      sessionStorage.setItem(VOTE_END_TIME_KEY, endTime.toString());
    }
  }, [lobbyId]);

  // 타이머 로직
  useEffect(() => {
    if (showResults) return;

    if (timeLeft <= 0) {
      if (!isVotingDisabled) {
        setIsVotingDisabled(true);
        calculateAndShowResults();
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, isVotingDisabled, showResults]);

  const calculateAndShowResults = () => {
    const currentImages = imagesRef.current;
    
    const sortedImages = [...currentImages].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));

    const bonusMap = {};
    let currentRank = 1;

    for (let i = 0; i < sortedImages.length; i++) {
        if (i > 0 && sortedImages[i].voteCount < sortedImages[i - 1].voteCount) {
            currentRank = i + 1;
        }

        let bonus = 0;
        if (currentRank === 1) bonus = 50;
        else if (currentRank === 2) bonus = 30;
        else if (currentRank === 3) bonus = 20;

        if (bonus > 0) {
            bonusMap[sortedImages[i].userId] = bonus;
        }
    }

    const currentPlayers = players.length > 0 ? players : [];
    const uniquePlayers = Array.from(
        new Map(currentPlayers.map(p => [p.userId, p])).values()
    );

    let updatedPlayers = uniquePlayers.map(p => {
      const bonus = bonusMap[p.userId] || 0;
      return {
        ...p,
        totalScore: (p.score || 0) + bonus,
        bonus: bonus
      };
    });

    updatedPlayers.sort((a, b) => b.totalScore - a.totalScore);

    let finalRank = 1;
    updatedPlayers = updatedPlayers.map((p, index) => {
        if (index > 0 && p.totalScore < updatedPlayers[index - 1].totalScore) {
            finalRank = index + 1;
        }
        return { ...p, realRank: finalRank };
    });

    setRankedPlayers(updatedPlayers);
    // ✅ [수정] 결과 저장도 sessionStorage
    sessionStorage.setItem(FINAL_RESULTS_KEY, JSON.stringify(updatedPlayers));
    setShowResults(true); 
  };

  useEffect(() => {
    if (!showResults || rankedPlayers.length === 0) return;

    const interval = setInterval(() => {
      setVisibleCount(prevCount => {
        if (prevCount >= rankedPlayers.length) {
          clearInterval(interval);
          setTimeout(() => setShowHomeButton(true), 1000);
          return prevCount;
        }
        return prevCount + 1;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [showResults, rankedPlayers]);

  // 데이터 로딩 및 소켓 연결
  useEffect(() => {
    if (!lobbyId) return;

    let retryCount = 0;
    const maxRetries = 10; 

    const fetchVoteData = async () => {
      try {
        const galleryRes = await axios.get(`${API_BASE_URL}/api/game/${lobbyId}/gallery`);
        const initializedData = galleryRes.data.map(img => ({
            ...img,
            voteCount: parseInt(img.voteCount || 0, 10)
        }));

        setImages(initializedData);

        // 이미지 개수 부족 시 재시도 (Race Condition 방지)
        const EXPECTED_ROUNDS = 3; 
        if (initializedData.length < EXPECTED_ROUNDS && retryCount < maxRetries) {
            console.log(`⏳ 이미지 로딩 대기 중... (${initializedData.length}/${EXPECTED_ROUNDS})`);
            retryCount++;
            setTimeout(fetchVoteData, 1000); 
        }

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
    sessionStorage.setItem(MY_VOTE_KEY, index.toString());

    if (stompClientRef.current && stompClientRef.current.connected) {
        stompClientRef.current.publish({
            destination: `/app/vote/${lobbyId}`,
            body: JSON.stringify({ voteIndex: index, userId: myUserId }),
        });
    }
  };

  const handleGoHome = () => {
    // ✅ [수정] sessionStorage 정리
    sessionStorage.removeItem(VOTE_END_TIME_KEY);
    sessionStorage.removeItem(MY_VOTE_KEY);
    sessionStorage.removeItem(FINAL_RESULTS_KEY);
    sessionStorage.removeItem(MY_USER_ID_KEY); 
    navigate('/');
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
          {showResults ? "투표 종료! 결과 발표" : (timeLeft > 0 ? `투표 종료까지 ${timeLeft}초` : "투표 종료! 결과 집계 중...")}
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
                    <p className="card-nickname">
                      {subjectText}
                      {img.nickname && (
                        <span className="card-artist"> {img.nickname}</span>
                      )}
                    </p>
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
            {rankedPlayers.slice(0, visibleCount).map((p) => {
              const rank = p.realRank;
              const isTop3 = rank <= 3;
              
              return (
                <li key={p.userId} className={`score-item rank-${rank}`}>
                  {isTop3 && <ConfettiExplosion />}
                  
                  <span className="rank-badge">{rank}위</span>
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
        <button onClick={handleGoHome} className="home-button boing-enter">
          메인으로 돌아가기
        </button>
      )}
    </div>
  );
};

export default VoteScreen;