import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { API_BASE_URL } from '../api/config';
import './VoteScreen.css';

// ... (CountUp, ConfettiExplosion 컴포넌트는 기존과 동일) ...
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

  const [isHost, setIsHost] = useState(false);
  const SAVE_WINNERS_DONE_KEY = `saveWinnersDone_${lobbyId}`;
  const hasSavedRef = useRef(sessionStorage.getItem(SAVE_WINNERS_DONE_KEY) === "true");

  const VOTE_END_TIME_KEY = `voteEndTime_${lobbyId}`;
  const MY_VOTE_KEY = `myVote_${lobbyId}`;
  const FINAL_RESULTS_KEY = `finalResults_${lobbyId}`;
  const MY_USER_ID_KEY = `voteUserId_${lobbyId}`;
  const TOTAL_ROUNDS_KEY = `totalRounds_${lobbyId}`;
  
  // ✅ [수정 1] 로딩 확인용 키 추가
  const HAS_VIEWED_LOADING_KEY = `hasViewedLoading_${lobbyId}`;

  // ✅ [수정 2] isLoading 초기값을 세션 스토리지 기반으로 설정
  // 이미 로딩을 봤다면(새로고침 시) false로 시작, 처음이면 true로 시작
  const [isLoading, setIsLoading] = useState(() => {
    return !sessionStorage.getItem(HAS_VIEWED_LOADING_KEY);
  });

  const [players, setPlayers] = useState(location.state?.players || []);
  const [images, setImages] = useState([]);

  const [totalRounds] = useState(() => {
      if (location.state?.totalRounds) {
          sessionStorage.setItem(TOTAL_ROUNDS_KEY, location.state.totalRounds);
          return location.state.totalRounds;
      }
      const saved = sessionStorage.getItem(TOTAL_ROUNDS_KEY);
      return saved ? parseInt(saved, 10) : 3; 
  });

  const [myUserId] = useState(() => {
    const lobbyUserId = sessionStorage.getItem("userId");
    if (lobbyUserId) return lobbyUserId;

    const savedId = sessionStorage.getItem(MY_USER_ID_KEY);
    if (savedId) return savedId;
    const newId = "user_" + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem(MY_USER_ID_KEY, newId);
    return newId;
  });

  const [myVote, setMyVote] = useState(() => {
    const savedVote = sessionStorage.getItem(MY_VOTE_KEY);
    return savedVote !== null ? parseInt(savedVote, 10) : null;
  });

  // 타이머 초기값 계산
  const [timeLeft, setTimeLeft] = useState(() => {
    const savedEndTime = sessionStorage.getItem(VOTE_END_TIME_KEY);
    if (savedEndTime) {
      const remaining = Math.floor((parseInt(savedEndTime, 10) - Date.now()) / 1000);
      return remaining > 0 ? remaining : 0;
    }
    return 30; // 기본값 (실제 시작 시 재설정됨)
  });

  const [showResults, setShowResults] = useState(() => !!sessionStorage.getItem(FINAL_RESULTS_KEY));
  const [isVotingDisabled, setIsVotingDisabled] = useState(() => !!sessionStorage.getItem(FINAL_RESULTS_KEY));
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

  // ✅ [수정 3] 로딩 타이머 로직 변경
  useEffect(() => {
    if (!isLoading) return; // 이미 로딩 끝났으면 실행 안 함

    const timer = setTimeout(() => {
      setIsLoading(false);
      // 3초가 지나면 "로딩 봤음"이라고 기록 -> 이후 새로고침 시 로딩 스킵
      sessionStorage.setItem(HAS_VIEWED_LOADING_KEY, 'true');
    }, 3000);

    return () => clearTimeout(timer);
  }, [isLoading, HAS_VIEWED_LOADING_KEY]);

  // ✅ [수정 4] 종료 시간 설정 (타이머 동기화)
  useEffect(() => {
    // 로딩 중이면 타이머 시작점 설정 보류
    if (isLoading) return;

    // 로딩이 끝났는데 종료 시간이 설정되어 있지 않다면 -> 최초 진입 후 3초 지난 시점
    if (!sessionStorage.getItem(VOTE_END_TIME_KEY)) {
      const endTime = Date.now() + 30 * 1000;
      sessionStorage.setItem(VOTE_END_TIME_KEY, endTime.toString());
      setTimeLeft(30);
    } 
    // 새로고침의 경우: isLoading은 false지만 Key는 이미 있음 -> 아래 타이머 로직이 Date.now() 기준으로 자동 계산
  }, [lobbyId, isLoading, VOTE_END_TIME_KEY]);

  // ✅ [수정 5] 카운트다운 로직
  // isLoading 의존성을 제거하여 UI 렌더링과 별개로 시간 계산 로직이 돌도록 해도 되지만,
  // 위에서 isLoading일 때 UI를 막고 있으므로, 로딩이 false가 되는 순간 정확한 잔여 시간이 표시됨.
  useEffect(() => {
    // 1. 결과가 이미 나왔거나 로딩 중이면 타이머 로직 중단
    if (showResults || isLoading) return;

    const savedEndTime = sessionStorage.getItem(VOTE_END_TIME_KEY);
    
    // 종료 시간이 없으면 로직 수행 불가
    if (!savedEndTime) return;

    const checkTimeAndProcess = () => {
      const now = Date.now();
      const end = parseInt(savedEndTime, 10);
      
      // 남은 시간 계산 (음수 방지)
      const remainingSeconds = Math.max(0, Math.floor((end - now) / 1000));
      
      // UI 시간 업데이트
      setTimeLeft(remainingSeconds);

      // 시간이 다 됐을 때 (0초 이하)
      if (remainingSeconds <= 0) {
        // ⚠️ 중요: setInterval 안에서는 state인 images 대신 ref인 imagesRef.current를 사용해야
        // 최신 이미지 목록을 정확히 가져올 수 있습니다.
        if (!isVotingDisabled && imagesRef.current.length > 0) {
           console.log("⏰ 타이머 종료! 결과 집계 시작");
           setIsVotingDisabled(true); 
           calculateAndShowResults();
        }
      }
    };

    // 2. 컴포넌트 렌더링 시 즉시 한 번 체크
    checkTimeAndProcess();

    // 3. 1초마다 주기적으로 체크 (timeLeft가 변해도 이 인터벌은 유지됨)
    const timer = setInterval(checkTimeAndProcess, 1000);

    return () => clearInterval(timer);
  }, [showResults, isLoading, isVotingDisabled, VOTE_END_TIME_KEY]);

  const calculateAndShowResults = async () => {
    const currentImages = imagesRef.current;
    
    console.log("================ [점수 계산 시작] ================");
    console.log("📸 전체 이미지 데이터:", currentImages);

    // 1. 투표수 내림차순 정렬
    const sortedImages = [...currentImages].sort((a, b) => {
        const countA = parseInt(a.voteCount || 0, 10);
        const countB = parseInt(b.voteCount || 0, 10);
        return countB - countA;
    });

    const voteFrequency = {};
    sortedImages.forEach(img => {
        const v = parseInt(img.voteCount || 0, 10);
        voteFrequency[v] = (voteFrequency[v] || 0) + 1;
    });

    const bonusMap = {};
    let currentRank = 1;

    for (let i = 0; i < sortedImages.length; i++) {
        const thisVoteCount = parseInt(sortedImages[i].voteCount || 0, 10);
        
        if (i > 0 && thisVoteCount < parseInt(sortedImages[i - 1].voteCount || 0, 10)) {
            currentRank = i + 1;
        }

        const sameScoreCount = voteFrequency[thisVoteCount];
        let bonus = 0;

        if (currentRank === 1) {
            bonus = sameScoreCount >= 4 ? 0 : 50;
        } else if (currentRank === 2) {
            bonus = sameScoreCount >= 3 ? 0 : 30;
        } else if (currentRank === 3) {
            bonus = sameScoreCount >= 2 ? 0 : 20;
        } else {
            bonus = 0;
        }

        if (bonus > 0 && sortedImages[i].userId) {
            bonusMap[String(sortedImages[i].userId)] = bonus;
        }
    }

    const currentPlayers = players.length > 0 ? players : [];
    const uniquePlayers = Array.from(new Map(currentPlayers.map(p => [String(p.userId), p])).values());

    let updatedPlayers = uniquePlayers.map(p => {
      const pid = String(p.userId);
      const bonus = bonusMap[pid] || 0;
      return { ...p, totalScore: (p.score || 0) + bonus, bonus: bonus };
    });

    updatedPlayers.sort((a, b) => b.totalScore - a.totalScore);

    let finalRank = 1;
    updatedPlayers = updatedPlayers.map((p, index) => {
        if (index > 0 && p.totalScore < updatedPlayers[index - 1].totalScore) {
            finalRank = index + 1;
        }
        return { ...p, realRank: finalRank };
    });

    if (sortedImages.length > 0) {
      const top3Images = sortedImages
        .filter(img => parseInt(img.voteCount || 0, 10) > 0)
        .slice(0, 3);

      const winnersPayload = top3Images.map(img => {
        const parts = img.imageUrl.split('/');
        const filename = parts[parts.length - 1];
        return {
          lobbyId: lobbyId,
          filename: filename,
          keyword: img.keyword || "Unknown",
          voteCount: img.voteCount || 0
        };
      });

      // ✅ host만 + ✅ 1회만 저장
      if (isHost && !hasSavedRef.current && winnersPayload.length > 0) {
        try {
          await axios.post(`${API_BASE_URL}/monRnk/saveWinners`, winnersPayload);
          hasSavedRef.current = true;
          sessionStorage.setItem(SAVE_WINNERS_DONE_KEY, "true");
        } catch (error) {
          console.error("명예의 전당 저장 실패:", error);
        }
      }
    }

    setRankedPlayers(updatedPlayers);
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

  useEffect(() => {
    if (!lobbyId) return;

    let retryCount = 0;
    const maxRetries = 10; 

    const fetchVoteData = async () => {
      try {
        const galleryRes = await axios.get(`${API_BASE_URL}/api/game/${lobbyId}/gallery`);
        
        // ✅ [수정] 중복 제거 로직 추가
        // 서버 DB에 중복 저장되었더라도, 프론트에서 imageUrl이 같은 것은 하나만 남김
        const uniqueMap = new Map();
        galleryRes.data.forEach((item) => {
            // imageUrl을 key로 사용하여 중복 방지 (이미 존재하는 키면 무시)
            if (item.imageUrl && !uniqueMap.has(item.imageUrl)) {
                uniqueMap.set(item.imageUrl, item);
            }
        });
        
        // 중복이 제거된 배열 생성
        const uniqueData = Array.from(uniqueMap.values());

        const initializedData = uniqueData.map(img => ({
            ...img,
            voteCount: parseInt(img.voteCount || 0, 10)
        }));

        setImages(initializedData);

        const EXPECTED_ROUNDS = totalRounds; 
        console.log(`🖼️ 이미지 로드 현황: ${initializedData.length} / ${EXPECTED_ROUNDS}`);

        // 데이터가 아직 다 안 왔으면 재시도 (중복 제거된 개수 기준)
        if (initializedData.length < EXPECTED_ROUNDS && retryCount < maxRetries) {
            console.log(`⏳ 이미지 로딩 대기 중... (${initializedData.length}/${EXPECTED_ROUNDS})`);
            retryCount++;
            setTimeout(fetchVoteData, 1000); 
        }

        if (players.length === 0) {
            try {
              const lobbyRes = await axios.get(`${API_BASE_URL}/lobby/${lobbyId}`);
              const lobbyData = lobbyRes.data.lobby || lobbyRes.data;

              const hostId =
                lobbyData.hostUserId ??
                lobbyData.host_user_id ??
                lobbyData.host_userId;

              setIsHost(String(hostId) === String(sessionStorage.getItem("userId")));

              // players는 비어있을 때만 채우기 (덮어쓰기 방지)
              if (players.length === 0) {
                setPlayers(lobbyData.users || []);
              }
            } catch (e) {
              console.error("로비 정보 로딩 실패:", e);
            }
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
                    voteCount: voteCounts[idx] !== undefined ? parseInt(voteCounts[idx], 10) : parseInt(img.voteCount || 0, 10)
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
  }, [lobbyId, totalRounds]);

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
    sessionStorage.removeItem(VOTE_END_TIME_KEY);
    sessionStorage.removeItem(MY_VOTE_KEY);
    sessionStorage.removeItem(FINAL_RESULTS_KEY);
    sessionStorage.removeItem(MY_USER_ID_KEY);
    sessionStorage.removeItem(TOTAL_ROUNDS_KEY); 
    sessionStorage.removeItem(HAS_VIEWED_LOADING_KEY); // 홈으로 갈 땐 기록 삭제 (다음 게임 위해)
    sessionStorage.removeItem(SAVE_WINNERS_DONE_KEY);
    navigate('/');
  };

  const renderThumbs = (count) => {
    return Array.from({ length: count }).map((_, i) => (
        <span key={i} className="thumb-icon" style={{ animationDelay: `${i * 0.05}s`, '--rotate': `${i % 2 === 0 ? 15 : -15}deg` }}>
            👍
        </span>
    ));
  };

  if (isLoading) {
    return (
      <div className="loading-screen" style={{ 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh', 
      }}>
        <img 
          src="/img/loading.gif" 
          alt="Loading..." 
          style={{ width: '150px', height: '150px' }} 
        />
        <p style={{
            marginTop: '20px',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#fff',
            textShadow: '2px 2px 4px rgba(0,0,0,0.6)',
            fontFamily: '"Galmuri9", "DungGeunMo", "Press Start 2P", sans-serif'
        }}>
            다른 플레이어를 기다리고 있습니다...
        </p>
      </div>
    );
  }

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