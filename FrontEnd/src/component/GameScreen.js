import { Client } from '@stomp/stompjs';
import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SockJS from 'sockjs-client';

import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../api/config';
import './GameScreen.css';
import PenIcon from './icons/PenIcon';
import EraserSettings from './settingmodals/EraserSettings';
import FillSettings from './settingmodals/FillSettings';
import PenSettings from './settingmodals/PenSettings';

const hexToRgba = (hex) => {
  let c;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split('');
    if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    c = '0x' + c.join('');
    return [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];
  }
  if (/^#([A-Fa-f0-9]{8})$/.test(hex)) {
    c = parseInt(hex.substring(1), 16);
    return [(c >> 24) & 255, (c >> 16) & 255, (c >> 8) & 255, c & 255];
  }
  return [0, 0, 0, 255];
};

function GameScreen({ maxPlayers = 10 }) {
  const navigate = useNavigate();
  const params = useParams();
  const lobbyId = params.lobbyId || params.roomId; 

  const userId = sessionStorage.getItem('userId') || localStorage.getItem('userId');
  const nickname = sessionStorage.getItem('nickname') || localStorage.getItem('nickname');

  const stompRef = useRef(null);
  
  // [수정] 누락된 Ref 정의 추가
  const connectedRef = useRef(false);
  const reconnectingRef = useRef(false);
  const subsRef = useRef([]);

  // 소켓 연결 후 첫 업데이트인지 확인하는 변수
  const isFirstSocketUpdate = useRef(true);

  const [players, setPlayers] = useState([]);
  const [isDrawer, setIsDrawer] = useState(false);
  const [keyword, setKeyword] = useState(""); 
  
  const [isGameStarted, setIsGameStarted] = useState(false);
  
  // 서버 동기화용 종료 시간
  const [roundEndTime, setRoundEndTime] = useState(0); 

  //정답자 ID (하늘색 배경으로 표시용)
  const [winnerId, setWinnerId] = useState(null);

  //현재 출제자 ID 저장 (별 표시용)
  const [currentDrawerId, setCurrentDrawerId] = useState(null);

  // 정답 알림 모달 상태
  const [answerModal, setAnswerModal] = useState({ visible: false, winner: '', answer: '' });

  // 시간 초과 알림 모달
  const [timeOverModal, setTimeOverModal] = useState(false);

  // 출제자, 유저한테 뜨는 모달
  const [roundModal, setRoundModal] = useState({
    visible: false,
    role: null,   // 'drawer' | 'guesser'
    word: ''
  });

  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const isRemoteDrawing = useRef(false);
  const scaleRef = useRef({ x: 1, y: 1 });

  const historyRef = useRef([]);
  const redoStackRef = useRef([]);
  const currentStrokeRef = useRef([]);
  const pendingHistoryRef = useRef([]);
  const canvasReadyRef = useRef(false);

  const [activeTool, setActiveTool] = useState(() => localStorage.getItem('activeTool') || 'pen');
  const [showModal, setShowModal] = useState(false);
  const [penColor, setPenColor] = useState(() => localStorage.getItem('penColor') || '#000000ff');
  const [penWidth, setPenWidth] = useState(() => Number(localStorage.getItem('penWidth')) || 5);
  const [fillColor, setFillColor] = useState(() => localStorage.getItem('fillColor') || '#ff0000ff');
  const [eraserWidth, setEraserWidth] = useState(() => Number(localStorage.getItem('eraserWidth')) || 20);

  const [chatBubbles, setChatBubbles] = useState({});
  const userCardRefs = useRef({});
  const [chatMessage, setChatMessage] = useState('');
  const bubbleTimeoutRef = useRef({});

  const roundModalTimerRef = useRef(null);
  const [roundFinished, setRoundFinished] = useState(false);
  const timerBarRef = useRef(null);

  const prevDrawerIdRef = useRef(null);
  const keywordRef = useRef('');

  const handleLeaveGame = () => {
    // 1. 소켓 먼저 끊기 (중복 메시지 수신 방지)
    if (stompRef.current?.connected) {
      stompRef.current.publish({
        destination: `/app/lobby/${lobbyId}/leave`,
        body: JSON.stringify({ userId }),
      });
      stompRef.current.deactivate();
    }
    // 2. 페이지 이동
    navigate('/join');
  };
  const handleToolClick = (tool) => {
    if (activeTool === tool) {
      setShowModal((prev) => !prev);
    } else {
      setActiveTool(tool);
      setShowModal(true);
    }
  };

  const resetCanvasLocal = () => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    isRemoteDrawing.current = false;
    historyRef.current = [];
    redoStackRef.current = [];
    currentStrokeRef.current = [];
  };

  const showRoundModal = (drawerUserId, word) => {
    if (roundModalTimerRef.current) {
      clearTimeout(roundModalTimerRef.current);
    }

    const isMeDrawer = String(drawerUserId) === String(userId);

    setRoundModal({
      visible: true,
      role: isMeDrawer ? 'drawer' : 'guesser',
      word: word || '???',
    });

    roundModalTimerRef.current = setTimeout(() => {
      setRoundModal((prev) => ({ ...prev, visible: false }));
    }, 3000);
  };

  const saveMyDrawing = async (currentKeyword) => {
    if (!canvasRef.current) return;
    
    // 1. 원본 캔버스 가져오기
    const sourceCanvas = canvasRef.current;

    // 2. 임시 캔버스 생성 (메모리 상에만 존재)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sourceCanvas.width;
    tempCanvas.height = sourceCanvas.height;
    const tCtx = tempCanvas.getContext('2d');

    // 3. 임시 캔버스에 '흰색' 배경 채우기 (이게 없으면 투명 = 검은색이 됨)
    tCtx.fillStyle = '#FFFFFF';
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // 4. 흰색 배경 위에 원본 그림 복사하기
    tCtx.drawImage(sourceCanvas, 0, 0);

    // 5. 임시 캔버스에서 이미지 데이터 추출
    const base64Data = tempCanvas.toDataURL('image/jpeg', 0.8);

    try {
      await axios.post(`${API_BASE_URL}/api/game/image/save`, {
        lobbyId: lobbyId,
        userId: userId,
        nickname: nickname,
        keyword: currentKeyword, 
        base64Image: base64Data
      });
      console.log("🎨 내 그림 저장 완료! (흰색 배경 적용)");
    } catch (err) {
      console.error("❌ 그림 저장 실패:", err);
    }
  };

  useEffect(() => {
    keywordRef.current = keyword;
  }, [keyword]);

  useEffect(() => {
    if (!lobbyId) return;
    const fetchGameData = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/lobby/${lobbyId}`);
        const data = res.data?.lobby ?? res.data;
        if (data && data.users) {
          const hostId = data.hostUserId;
          const mappedUsers = data.users.map((u) => ({
            ...u,
            host: String(u.userId) === String(hostId),
          })).sort((a, b) => (a.host === b.host ? 0 : a.host ? -1 : 1));
          
          setPlayers(mappedUsers);
        }
      } catch (err) {
        console.error("데이터 로드 실패:", err);
      }
    };
    fetchGameData();
  }, [lobbyId, userId]);

  useEffect(() => {
    return () => {
      if (roundModalTimerRef.current) {
        clearTimeout(roundModalTimerRef.current);
      }
    };
  }, []);

  const playersRef = useRef([]); // 최신 플레이어 상태를 담을 Ref
    useEffect(() => {
      playersRef.current = players;
    }, [players])

  useEffect(() => {
    if (!userId || !nickname || !lobbyId) return;
    
    // [수정] isMounted 변수 정의
    let isMounted = true; 

    // [수정] safeUnsubscribeAll 함수 정의
    const safeUnsubscribeAll = () => {
        if (subsRef.current) {
            subsRef.current.forEach(sub => sub.unsubscribe());
            subsRef.current = [];
        }
    };

    // [수정] safeDeactivate 함수 정의
    const safeDeactivate = (client) => {
        if (client && client.active) {
            client.deactivate();
        }
    };

    isFirstSocketUpdate.current = true;

    // [수정] connect 함수로 래핑
    const connect = () => {
      const client = new Client({
        webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),

        // ✅ 자동 재연결
        reconnectDelay: 3000,

        // ✅ heartbeat (서버가 지원할 때 안정성 ↑)
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,

        // 디버그 로그 줄이기(원하면 주석)
        debug: () => {},

        onConnect: () => {
          if (!isMounted) return;

          connectedRef.current = true;
          reconnectingRef.current = false;

          // ✅ 구독 중복 방지: 연결될 때마다 기존 구독 정리 후 다시 구독
          safeUnsubscribeAll();

          console.log("✅ Game STOMP connected");

          // 1) lobby topic
          const subLobby = client.subscribe(`/topic/lobby/${lobbyId}`, (msg) => {
            const data = JSON.parse(msg.body);

          const updateDrawerState = (newDrawerId, newWord, endTime) => {
            setIsDrawer(String(newDrawerId) === String(userId));
            setCurrentDrawerId(newDrawerId);
            if (newWord) setKeyword(newWord);
            if (endTime !== undefined) setRoundEndTime(endTime);
          };

          if (data.type === 'CORRECT_ANSWER') {
             const winnerId = data.winnerUserId;
             const winnerName = data.winnerNickname;
             const answer = data.answer;
             
             setWinnerId(winnerId);
             setAnswerModal({ visible: true, winner: winnerName, answer: answer });
             setRoundEndTime(0);
             setRoundFinished(true);
             setTimeout(() => {
                 setAnswerModal(prev => ({ ...prev, visible: false }));
             }, 1500);
          }

          if (data.type === 'USER_UPDATE') {
            const hostId = data.hostUserId;
            const mappedUsers = (data.users || []).map((u) => ({
              ...u,
              host: String(u.userId) === String(hostId),
            })).sort((a, b) => (a.host === b.host ? 0 : a.host ? -1 : 1));
            
            setPlayers(mappedUsers);
            console.log(`[USER_UPDATE] 인원: ${mappedUsers.length}, 게임중: ${data.gameStarted}`);

            // 🔥 [게임 중 혼자 남음 처리 수정]
            // alert는 비동기 처리 중 씹힐 수 있으므로 window.confirm이나 확실한 로직 필요
            if (data.gameStarted && mappedUsers.length < 2) {
                // 브라우저 렌더링 사이클 확보를 위해 0ms setTimeout 사용
                setTimeout(() => {
                    alert("모든 유저가 나갔습니다. 게임을 종료합니다.");
                    handleLeaveGame();
                }, 0);
                return;
            }
            
            if (data.gameStarted) {
              setIsGameStarted(true);
              if (data.drawerUserId) {
                  updateDrawerState(data.drawerUserId, data.word, data.roundEndTime, false);
                  prevDrawerIdRef.current = String(data.drawerUserId);
                  if (isFirstSocketUpdate.current) {
                      setAnswerModal({ visible: false, winner: '', answer: '' });
                      setTimeOverModal(false);
                      setTimeout(() => {
                            showRoundModal(data.drawerUserId, data.word);
                      }, 300);
                  }
              }
            } else {
              if (data.gameStarted && mappedUsers.length < 2) {
                // 여기도 동일하게 처리
                setTimeout(() => {
                    alert("유저가 없습니다. 세션을 종료합니다.");
                    handleLeaveGame();
                }, 0);
                return;
              }
            }
            isFirstSocketUpdate.current = false;
          }

          if (data.type === 'GAME_START') {
            const targetDrawerId = data.drawerUserId || data.drawerId;
            const targetWord = data.word || data.keyword;

            setIsGameStarted(true);
            setIsDrawer(String(targetDrawerId) === String(userId));
            setCurrentDrawerId(targetDrawerId);
            setKeyword(targetWord);

            showRoundModal(targetDrawerId, targetWord);

            // 현재 출제자 기록
            prevDrawerIdRef.current = String(targetDrawerId);

            isFirstSocketUpdate.current = false;
          }


          if (data.type === 'ROUND_START') {
            setRoundEndTime(data.roundEndTime);
          }

          if (data.type === 'DRAWER_CHANGED') {
            /* =========================
              1️⃣ 이전 출제자면 그림 저장
            ========================= */
            if (String(prevDrawerIdRef.current) === String(userId)) {
              saveMyDrawing(keywordRef.current);
            }

            /* =========================
              2️⃣ 라운드 상태 초기화
            ========================= */
            setRoundFinished(false);
            setWinnerId(null);
            setRoundEndTime(0);
            setAnswerModal({ visible: false, winner: '', answer: '' });
            setTimeOverModal(false);

            resetCanvasLocal();

            /* =========================
              3️⃣ 출제자 / 단어 결정
            ========================= */
            const targetDrawerId = data.drawerUserId || data.drawerId;
            const targetWord = data.word || data.keyword || '???';

            updateDrawerState(targetDrawerId, targetWord, 0);

            /* =========================
              4️⃣ 🔥 통합 모달 (showRoundModal)
            ========================= */
            showRoundModal(targetDrawerId, targetWord);

            /* =========================
              5️⃣ 내가 출제자라면 캔버스 클리어 + 펜 초기화
            ========================= */
            if (String(targetDrawerId) === String(userId)) {
              stompRef.current?.publish({
                destination: `/app/draw/${lobbyId}/clear`,
                body: JSON.stringify({ userId }),
              });

              setPenColor('#000000ff');
              setActiveTool('pen');
            }

            /* =========================
              6️⃣ 현재 출제자 기록
            ========================= */
            prevDrawerIdRef.current = String(targetDrawerId);
          }


          if (data.type === 'ROOM_DESTROYED') {
            setTimeout(() => {
                alert('방이 삭제되었습니다.');
                navigate('/');
            }, 0);
          }

          if (data.type === 'TIME_OVER') {
            setTimeOverModal(true);
            setRoundEndTime(0);
            setRoundFinished(true);
            setRoundModal({ visible: false, role: null, word: '' });
            if (roundModalTimerRef.current) {
              clearTimeout(roundModalTimerRef.current);
              roundModalTimerRef.current = null;
            }
          }

          if (data.type === 'GAME_OVER') {
            if (String(prevDrawerIdRef.current) === String(userId)) {
              saveMyDrawing(keywordRef.current);
            }
            setTimeOverModal(false);
            alert(`게임이 종료되었습니다.`);
            navigate(`/vote/${lobbyId}`, { state: { players: playersRef.current } }); // playersRef 사용 권장
          }
        });

        // ... (draw, history, chat 등 기존 구독 로직 동일)
        // [수정] subDraw 변수에 할당하도록 수정
        const subDraw = client.subscribe(`/topic/lobby/${lobbyId}/draw`, (msg) => {
            const evt = JSON.parse(msg.body);
            applyRemoteDraw(evt);
          });

          // 3) history topic
          const subHistory = client.subscribe(`/topic/history/${userId}`, (msg) => {
            const data = JSON.parse(msg.body);
            const historyList = data.history || [];
            const redoList = data.redoStack || [];

            if (canvasReadyRef.current) {
              historyList.forEach((evt) => applyRemoteDraw(evt, true));
            } else {
              pendingHistoryRef.current = historyList;
            }
            redoStackRef.current = redoList;
          });

          // 4) chat bubble
          const subChat = client.subscribe('/topic/chat/bubble', (msg) => {
            const data = JSON.parse(msg.body);
            if (data.type !== 'CHAT_BUBBLE') return;
            const uid = data.userId;

            setChatBubbles((prev) => ({ ...prev, [uid]: data.message }));
            if (bubbleTimeoutRef.current[uid]) clearTimeout(bubbleTimeoutRef.current[uid]);

            bubbleTimeoutRef.current[uid] = setTimeout(() => {
              setChatBubbles((prev) => {
                const copy = { ...prev };
                delete copy[uid];
                return copy;
              });
            }, 3000);
          });

          subsRef.current = [subLobby, subDraw, subHistory, subChat];

          // ✅ (재)연결될 때마다 join 보냄
          try {
            client.publish({
              destination: `/app/lobby/${lobbyId}/join`,
              body: JSON.stringify({ userId, nickname }),
            });
          } catch (e) {
            console.warn("join publish 실패:", e);
          }
        },

        // ✅ STOMP 레벨 에러
        onStompError: (frame) => {
          console.error("❌ STOMP error:", frame?.headers?.message || frame);
        },

        // ✅ WebSocket 레벨 에러/종료
        onWebSocketError: (evt) => {
          console.warn("⚠️ WebSocket error:", evt);
        },
        onWebSocketClose: () => {
          connectedRef.current = false;
          reconnectingRef.current = true;

          // 끊김 순간에 "2명 미만 처리" 타이머가 돌고 있으면 일단 유지(유예가 있으니까)
          // 필요하면 여기서 UI로 "재연결중..." 표시 가능
          console.warn("⚠️ WebSocket closed (reconnecting...)");
        },
        onDisconnect: () => {
          connectedRef.current = false;
          console.warn("⚠️ STOMP disconnected");
        },
      });

      stompRef.current = client;
      client.activate();
    }; // connect 함수 종료

    connect();

    return () => {
      isMounted = false;
      // [수정] 정의되지 않은 함수 호출 제거 (clearMinPlayersGraceTimer)

      // bubble 타이머 정리
      Object.values(bubbleTimeoutRef.current).forEach((t) => clearTimeout(t));
      bubbleTimeoutRef.current = {};

      if (stompRef.current) {
        safeDeactivate(stompRef.current);
        stompRef.current = null;
      }
    };
  }, [lobbyId, userId, nickname, navigate]);

  // 🔥 [수정] 타이머 안전장치 추가 (에러 방지 핵심)
  useEffect(() => {
    // 타이머바 DOM 요소가 없으면 애니메이션 시작조차 하지 않음
    if (!isGameStarted || !roundEndTime) return;

    const GAME_DURATION = 60000;
    let rafId;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = roundEndTime - now;

      // DOM 요소가 존재하는지 매 프레임 확인
      if (!timerBarRef.current) {
          // 컴포넌트가 언마운트되었거나 페이지 이동 중이라면 루프 종료
          return;
      }

      if (remaining <= 0) {
        timerBarRef.current.style.width = '0%';
        return;
      }

      const percent = Math.max(0, (remaining / GAME_DURATION) * 100);
      timerBarRef.current.style.width = `${percent}%`;
      
      rafId = requestAnimationFrame(updateTimer);
    };

    updateTimer();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [roundEndTime, isGameStarted]);

  // ... (나머지 로직 동일)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctxRef.current = ctx;
    canvasReadyRef.current = true;
    if (pendingHistoryRef.current.length > 0) {
      pendingHistoryRef.current.forEach((evt) => applyRemoteDraw(evt, true));
      pendingHistoryRef.current = [];
    }
  }, []);

  useEffect(() => {
    if (!ctxRef.current) return;
    if (activeTool === 'eraser') {
      ctxRef.current.globalCompositeOperation = 'destination-out';
      ctxRef.current.lineWidth = eraserWidth;
    } else {
      ctxRef.current.globalCompositeOperation = 'source-over';
      ctxRef.current.strokeStyle = penColor;
      ctxRef.current.lineWidth = penWidth;
    }
  }, [activeTool, penColor, penWidth, eraserWidth]);

  const redrawAll = () => {
     const ctx = ctxRef.current;
     const canvas = canvasRef.current;
     if (!ctx || !canvas) return;
     ctx.clearRect(0, 0, canvas.width, canvas.height);
     historyRef.current.forEach((action) => {
        if (action.type === 'CLEAR') {
           ctx.clearRect(0, 0, canvas.width, canvas.height);
        } else if (action.type === 'FILL') {
           floodFill(action.x, action.y, action.color);
        } else if (action.type === 'STROKE') {
           ctx.beginPath();
           if (action.points && action.points.length > 0) {
              ctx.moveTo(action.points[0].x, action.points[0].y);
              for (let i = 1; i < action.points.length; i++) ctx.lineTo(action.points[i].x, action.points[i].y);
           }
           ctx.lineCap = 'round';
           ctx.lineJoin = 'round';
           if (action.tool === 'eraser') {
              ctx.globalCompositeOperation = 'destination-out';
              ctx.strokeStyle = 'rgba(0,0,0,1)';
           } else {
              ctx.globalCompositeOperation = 'source-over';
              ctx.strokeStyle = action.color;
           }
           ctx.lineWidth = action.lineWidth;
           ctx.stroke();
        }
     });
     if (activeTool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = eraserWidth;
     } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = penColor;
        ctx.lineWidth = penWidth;
     }
  };

  const publishDraw = (evt) => {
    const client = stompRef.current;
    if (!client || !client.connected) return;

    try {
      client.publish({
        destination: `/app/draw/${lobbyId}`,
        body: JSON.stringify({ ...evt, userId }),
      });
    } catch (e) {
      console.warn('publishDraw failed', e);
    }
  };

  const applyRemoteDraw = (evt, isHistory = false) => {
    const isMe = String(evt.userId) === String(userId);
    if (!isHistory && isMe) return;
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    if (evt.type === 'UNDO') {
      if (historyRef.current.length > 0) {
        redoStackRef.current.push(historyRef.current.pop());
        redrawAll();
      }
      return;
    }
    if (evt.type === 'REDO') {
      if (redoStackRef.current.length > 0) {
        historyRef.current.push(redoStackRef.current.pop());
        redrawAll();
      }
      return;
    }
    if (evt.type === 'CLEAR') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      isRemoteDrawing.current = false;
      historyRef.current.push({ type: 'CLEAR' });
      redoStackRef.current = [];
      return;
    }
    if (evt.type === 'FILL') {
      floodFill(evt.x, evt.y, evt.color);
      historyRef.current.push({ type: 'FILL', x: evt.x, y: evt.y, color: evt.color });
      redoStackRef.current = [];
      return;
    }
    if (evt.points && evt.points.length > 0) {
       ctx.beginPath();
       if (evt.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = 'rgba(0,0,0,1)';
       } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = evt.color;
       }
       ctx.lineWidth = evt.lineWidth || evt.width || 5;
       ctx.moveTo(evt.points[0].x, evt.points[0].y);
       for (let i = 1; i < evt.points.length; i++) ctx.lineTo(evt.points[i].x, evt.points[i].y);
       ctx.stroke();
       ctx.closePath();
       historyRef.current.push({ type: 'STROKE', tool: evt.tool, color: evt.color, lineWidth: evt.lineWidth || 5, points: evt.points });
       return;
    }
    if (evt.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = evt.color;
    }
    ctx.lineWidth = evt.lineWidth || evt.width || 5;
    if (evt.type === 'START') {
      ctx.beginPath();
      ctx.moveTo(evt.x, evt.y);
      isRemoteDrawing.current = true;
      currentStrokeRef.current = [{ x: evt.x, y: evt.y }];
    }
    if (evt.type === 'MOVE') {
      if (!isRemoteDrawing.current) {
        ctx.beginPath();
        ctx.moveTo(evt.x, evt.y);
        isRemoteDrawing.current = true;
        currentStrokeRef.current = [{ x: evt.x, y: evt.y }];
      } else {
        ctx.lineTo(evt.x, evt.y);
        ctx.stroke();
        currentStrokeRef.current.push({ x: evt.x, y: evt.y });
      }
    }
    if (evt.type === 'END') {
      ctx.closePath();
      isRemoteDrawing.current = false;
      if (currentStrokeRef.current.length > 0) {
        historyRef.current.push({
          type: 'STROKE', tool: evt.tool, color: evt.color, lineWidth: evt.lineWidth || 5, points: [...currentStrokeRef.current]
        });
        currentStrokeRef.current = [];
        redoStackRef.current = [];
      }
    }
    if (!isHistory && isDrawer) {
       if (activeTool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = eraserWidth;
       } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = penColor;
          ctx.lineWidth = penWidth;
       }
    }
  };

  const calculateScale = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    scaleRef.current = { x: canvas.width / rect.width, y: canvas.height / rect.height };
  };

  const startDraw = (e) => {
    if (!isDrawer) return;

    if (!stompRef.current?.connected) return;

    calculateScale();
    const x = Math.round(e.nativeEvent.offsetX * scaleRef.current.x);
    const y = Math.round(e.nativeEvent.offsetY * scaleRef.current.y);
    if (activeTool === 'fill') {
      floodFill(x, y, fillColor);
      historyRef.current.push({ type: 'FILL', x, y, color: fillColor });
      redoStackRef.current = [];
      publishDraw({ type: 'FILL', x, y, color: fillColor });
      return;
    }
    drawing.current = true;
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(x, y);
    currentStrokeRef.current = [{ x, y }];
    publishDraw({ type: 'START', x, y, tool: activeTool, color: penColor, lineWidth: activeTool === 'eraser' ? eraserWidth : penWidth });
  };

  const draw = (e) => {
    if (!isDrawer || !drawing.current) return;
    if (!stompRef.current?.connected) return;
    const x = Math.round(e.nativeEvent.offsetX * scaleRef.current.x);
    const y = Math.round(e.nativeEvent.offsetY * scaleRef.current.y);
    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();
    currentStrokeRef.current.push({ x, y });
    publishDraw({ type: 'MOVE', x, y, tool: activeTool, color: penColor, lineWidth: activeTool === 'eraser' ? eraserWidth : penWidth });
  };

  const endDraw = () => {
    if (!drawing.current) return;
    if (!stompRef.current?.connected) { 
    drawing.current = false; 
    return; 
  }
    drawing.current = false;
    ctxRef.current.closePath();
    const strokePoints = [...currentStrokeRef.current];
    if (currentStrokeRef.current.length > 0) {
       historyRef.current.push({ type: 'STROKE', tool: activeTool, color: penColor, lineWidth: activeTool === 'eraser' ? eraserWidth : penWidth, points: strokePoints });
       currentStrokeRef.current = [];
       redoStackRef.current = [];
    }
    publishDraw({ type: 'END', tool: activeTool, color: penColor, lineWidth: activeTool === 'eraser' ? eraserWidth : penWidth, points: strokePoints });
  };

  const clearCanvas = () => {
    if (!isDrawer) return;
    const ctx = ctxRef.current;
    if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    historyRef.current.push({ type: 'CLEAR' });
    redoStackRef.current = [];
    // ✅ STOMP 연결이 살아있을 때만 publish
    if (stompRef.current?.connected) {
      try {
        stompRef.current.publish({
          destination: `/app/draw/${lobbyId}/clear`,
          body: JSON.stringify({ userId }),
        });
      } catch (_) {}
    }
  };

  const handleUndo = () => {
    if (!isDrawer || historyRef.current.length === 0) return;
    redoStackRef.current.push(historyRef.current.pop());
    redrawAll();
    publishDraw({ type: 'UNDO' });
  };

  const handleRedo = () => {
    if (!isDrawer || redoStackRef.current.length === 0) return;
    historyRef.current.push(redoStackRef.current.pop());
    redrawAll();
    publishDraw({ type: 'REDO' });
  };

  const floodFill = (x, y, color) => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;
    const [r, g, b, a] = hexToRgba(color);
    const idx = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
    const target = data.slice(idx, idx + 4);
    if (target[0] === r && target[1] === g && target[2] === b && target[3] === a) return;
    const stack = [[Math.floor(x), Math.floor(y)]];
    while (stack.length) {
       const [cx, cy] = stack.pop();
       if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height) continue;
       const i = (cy * canvas.width + cx) * 4;
       if (data[i] === target[0] && data[i + 1] === target[1] && data[i + 2] === target[2] && data[i + 3] === target[3]) {
          data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
          stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
       }
    }
    ctx.putImageData(img, 0, 0);
  };

  const handleSendChat = () => {
    if (!chatMessage.trim()) return;
    const client = stompRef.current;
    if (!client || !client.connected) return;

    try {
      client.publish({
        destination: '/app/chat/bubble',
        body: JSON.stringify({ lobbyId, userId, message: chatMessage }),
      });
      setChatMessage('');
    } catch (e) {
      console.warn("chat publish failed:", e);
    }
  };
  const totalSlots = Array.from({ length: maxPlayers }, (_, i) => players[i] || null);
  const leftUsers = totalSlots.filter((_, i) => i % 2 === 0);
  const rightUsers = totalSlots.filter((_, i) => i % 2 === 1);

  const renderUser = (u, index) => (
    <div
      key={index}
      className={`user-card ${!u ? 'empty' : ''} ${u && String(u.userId) === String(winnerId) ? 'winner' : ''}`}
      ref={(el) => { if (u && el) userCardRefs.current[u.userId] = el; }}
    >
      <div className="avatar" />
      <span className="username">
        {u ? u.nickname : 'Empty'}
        {u && String(u.userId) === String(currentDrawerId) && <span style={{ color: 'gold', marginLeft: 6 }}>★</span>}
      </span>
        {u && (
          <span className="user-score" style={{ fontSize: '12px', color: '#1971c2', fontWeight: 'bold' }}>
            Score: {u.score || 0}
          </span>
        )}
    </div>
  );

  return (
    <div className="game-wrapper">
       
       {answerModal.visible && createPortal(
         <div className="answer-modal-overlay" style={{ zIndex: 99999 }}>
            <div className="answer-modal-content">
                <div className="confetti">🎉</div>
                <h2>정답자가 나왔습니다!</h2>
                <div className="modal-info">
                    <p>정답: <span className="highlight-text">{answerModal.answer}</span></p>
                    <p>정답자: <span className="highlight-winner">{answerModal.winner}</span></p>
                </div>
            </div>
         </div>,
         document.body
       )}

       {timeOverModal && createPortal(
         <div className="answer-modal-overlay" style={{ zIndex: 99999 }}>
            <div className="answer-modal-content">
                <div className="confetti" style={{ fontSize: '3rem' }}>⌛️</div>
                <h2>시간 초과!</h2>
                <div className="modal-info">
                    <p>아무도 정답을 맞추지 못했습니다 😭</p>
                    <p style={{ marginTop: '10px', fontSize: '0.9rem', color: '#666' }}>
                        잠시 후 다음 라운드가 시작됩니다...
                    </p>
                </div>
            </div>
         </div>,
         document.body
       )}

       {roundModal.visible && createPortal(
        <div className="answer-modal-overlay" style={{ zIndex: 99999 }}>
          <div className="answer-modal-content">

            {roundModal.role === 'drawer' ? (
              <>
                <h2>당신이 출제자 입니다!</h2>
                <div className="modal-info">
                  <p style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>
                    주제어: <span className="highlight-text">{roundModal.word}</span>
                  </p>
                  <p style={{ marginTop: '15px' }}>그림을 그려주세요 🎨</p>
                </div>
              </>
            ) : (
              <>
                <div className="confetti" style={{ fontSize: '3rem' }}>🤔</div>
                <h2>그림을 맞춰보세요!</h2>
                <div className="modal-info">
                  <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                    출제자가 그림을 그리고 있습니다.
                  </p>
                  <p style={{ marginTop: '10px', color: '#666' }}>
                    채팅창에 정답을 입력하세요! ⌨️
                  </p>
                </div>
              </>
            )}

          </div>
        </div>,
        document.body
      )}

       <button className="back-btn" onClick={handleLeaveGame}>
         <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
         </svg>
       </button>

       <div className="game-area">
          <div className="game-grid">
             
             <div className="user-column left">
                {leftUsers.map((u, i) => renderUser(u, i * 2))}
             </div>

             <div className="center-board-area">
                <div className="board-wrapper">
                    <div className="canvas-group">
                        {isGameStarted && (
                          <div className="timer-container">
                            <div ref={timerBarRef} className="timer-bar"></div>
                          </div>
                        )}
                        <div className="drawingBoard" style={{ backgroundImage: "url('/img/board.png')" }}>
                           <canvas
                             ref={canvasRef}
                             className="canvas"
                             width={746} height={603}
                             onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                           />
                        </div>
                    </div>

                    {isDrawer && (
                       <div className="tool-container">
                          {keyword && (
                            <div className="keyword-badge">
                              주제어: <strong>{keyword}</strong>
                            </div>
                          )}
                          <div className="tool-box">
                             {showModal && activeTool === 'pen' && <PenSettings color={penColor} setColor={setPenColor} width={penWidth} setWidth={setPenWidth} onClose={() => setShowModal(false)} />}
                             {showModal && activeTool === 'fill' && <FillSettings color={fillColor} setColor={setFillColor} onClose={() => setShowModal(false)} />}
                             {showModal && activeTool === 'eraser' && <EraserSettings width={eraserWidth} setWidth={setEraserWidth} onClose={() => setShowModal(false)} />}
                             
                             <div className={`tool-btn ${activeTool === 'pen' ? 'active' : ''}`} onClick={() => handleToolClick('pen')}><PenIcon color={penColor} /></div>
                             <div className={`tool-btn ${activeTool === 'fill' ? 'active' : ''}`} onClick={() => handleToolClick('fill')}><img src="/svg/fill.svg" alt="fill" /></div>
                             <div className={`tool-btn ${activeTool === 'eraser' ? 'active' : ''}`} onClick={() => handleToolClick('eraser')}><img src="/svg/eraser.svg" alt="eraser" /></div>
                             
                             <div className="tool-btn" onClick={handleUndo} title="Undo">
                               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                 <path d="M9 14 4 9l5-5"/>
                                 <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
                               </svg>
                             </div>

                             <div className="tool-btn" onClick={handleRedo} title="Redo">
                               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                 <path d="m15 14 5-5-5-5"/>
                                 <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/>
                               </svg>
                             </div>
                             <div className="tool-btn delete-btn" onClick={clearCanvas}>🗑</div>
                          </div>
                       </div>
                    )}
                </div>
             </div>
             
             <div className="user-column right">
                {rightUsers.map((u, i) => renderUser(u, i * 2 + 1))}
             </div>

          </div>
       </div>
       
       {Object.entries(chatBubbles).map(([uid, msg]) => {
         const el = userCardRefs.current[uid];
         if (!el) return null;
         const rect = el.getBoundingClientRect();
         return (
          <div key={uid} className="chat-bubble-float" style={{ position: 'fixed', top: rect.top + rect.height / 2, left: rect.right + 12, transform: 'translateY(-50%)', zIndex: 9999, maxWidth: '220px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', pointerEvents: 'none' }}>
              {msg}
          </div>
        );
       })}
       <div className="chat-area">
          <input type="text"
            placeholder="메시지 입력..."
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)} 
            onKeyDown={(e) => { 
                if (e.nativeEvent.isComposing) return; 
                if (e.key === 'Enter') handleSendChat(); 
              }}
            />
          <button onClick={handleSendChat}>전송</button>
       </div>
    </div>
  );
}

export default GameScreen;