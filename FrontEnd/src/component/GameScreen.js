import { Client } from '@stomp/stompjs';
import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SockJS from 'sockjs-client';

import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../api/config';
import './GameScreen.css';
import PenIcon from './icons/PenIcon';
import EraserSettings from './settingmodals/EraserSettings';
import FillSettings from './settingmodals/FillSettings';
import PenSettings from './settingmodals/PenSettings';

const getProfileImgPath = (profileValue) => {
  if (!profileValue || profileValue === "default") {
    return "/img/profile/default.jpg";
  }
  return `/img/profile/profile${profileValue}.jpg`;
};

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
  
  const connectedRef = useRef(false);
  const reconnectingRef = useRef(false);
  const subsRef = useRef([]);

  const isFirstSocketUpdate = useRef(true);

  const [players, setPlayers] = useState([]);
  const [isDrawer, setIsDrawer] = useState(false);
  const [keyword, setKeyword] = useState(""); 
  
  const [isGameStarted, setIsGameStarted] = useState(false);
  
  const [roundEndTime, setRoundEndTime] = useState(0); 

  const [winnerId, setWinnerId] = useState(null);

  const [currentDrawerId, setCurrentDrawerId] = useState(null);

  const [answerModal, setAnswerModal] = useState({ visible: false, winner: '', answer: '' });

  const [timeOverModal, setTimeOverModal] = useState(false);

  const [forceExitModal, setForceExitModal] = useState(false);

  const [gameOverModal, setGameOverModal] = useState(false);

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

  const customCursorRef = useRef(null); 

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

  const [shouldForceLeave, setShouldForceLeave] = useState(false);

  const isGameStartedRef = useRef(false);

  const chatInputRef = useRef(null);

  const [remainingSeconds, setRemainingSeconds] = useState(null);

  const handleLeaveGame = useCallback (() => {
    if (stompRef.current?.connected) {
      stompRef.current.publish({
        destination: `/app/lobby/${lobbyId}/leave`,
        body: JSON.stringify({ userId }),
      });
      stompRef.current.deactivate();
    }
    navigate('/join');
  }, [lobbyId, userId, navigate]);

  const handleToolClick = (tool) => {
    if (activeTool === tool) {
      setShowModal((prev) => !prev);
    } else {
      setActiveTool(tool);
      setShowModal(false);
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

  const handleCursorMove = (e) => {
    if (customCursorRef.current) {
      customCursorRef.current.style.left = `${e.clientX}px`;
      customCursorRef.current.style.top = `${e.clientY}px`;
    }
    draw(e); 
  };

  const handleCursorEnter = () => {
    if (customCursorRef.current) {
      customCursorRef.current.style.display = 'block';
    }
  };

  const handleCursorLeave = () => {
    if (customCursorRef.current) {
      customCursorRef.current.style.display = 'none';
    }
    endDraw(); 
  };

  const saveMyDrawing = async (currentKeyword) => {
    if (!canvasRef.current) return;
    
    const sourceCanvas = canvasRef.current;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sourceCanvas.width;
    tempCanvas.height = sourceCanvas.height;
    const tCtx = tempCanvas.getContext('2d');

    tCtx.fillStyle = '#FFFFFF';
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tCtx.drawImage(sourceCanvas, 0, 0);

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

  const playersRef = useRef([]); 
    useEffect(() => {
      playersRef.current = players;
    }, [players]);

  useEffect(() => {
    isGameStartedRef.current = isGameStarted;
  }, [isGameStarted]);

  useEffect(() => {
    if (shouldForceLeave) {
      setForceExitModal(true);
    }
  }, [shouldForceLeave]);

  useEffect(() => {
    if (!userId || !nickname || !lobbyId) return;
    
    let isMounted = true; 

    const safeUnsubscribeAll = () => {
        if (subsRef.current) {
            subsRef.current.forEach(sub => sub.unsubscribe());
            subsRef.current = [];
        }
    };

    const safeDeactivate = (client) => {
        if (client && client.active) {
            client.deactivate();
        }
    };

    isFirstSocketUpdate.current = true;

    const connect = () => {
      const client = new Client({
        webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),
        reconnectDelay: 3000,
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,
        debug: () => {},

        onConnect: () => {
          if (!isMounted) return;

          connectedRef.current = true;
          reconnectingRef.current = false;
          safeUnsubscribeAll();

          console.log("Game STOMP connected");

          const subLobby = client.subscribe(`/topic/lobby/${lobbyId}`, (msg) => {
            const data = JSON.parse(msg.body);

          const updateDrawerState = (newDrawerId, newWord, endTime) => {
            setIsDrawer(String(newDrawerId) === String(userId));
            setCurrentDrawerId(newDrawerId);
            if (newWord) setKeyword(newWord);
            if (endTime !== undefined) setRoundEndTime(endTime);
          };

          const updateRoundSignature = (drawerId, word) => {
            const safeWord = word || "???"; 
            const signature = `${lobbyId}_${drawerId}_${safeWord}`;
            sessionStorage.setItem('currentRoundSignature', signature);
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
            const mappedUsers = (data.users || [])
              .map((u) => ({
                ...u,
                host: String(u.userId) === String(hostId),
              }))
              .sort((a, b) => (a.host === b.host ? 0 : a.host ? -1 : 1));

            setPlayers(mappedUsers);

            if (
              (data.gameStarted || isGameStartedRef.current) &&
              mappedUsers.length < 2 &&
              !shouldForceLeave
            ) {
              setShouldForceLeave(true);
              return;
            }

            if (data.gameStarted) {
              setIsGameStarted(true);

              if (data.drawerUserId) {
                updateDrawerState(
                  data.drawerUserId,
                  data.word,
                  data.roundEndTime
                );

                prevDrawerIdRef.current = String(data.drawerUserId);

                if (isFirstSocketUpdate.current) {
                    setAnswerModal({ visible: false, winner: '', answer: '' });
                    setTimeOverModal(false);

                    const safeWord = data.word || "???";
                    const currentSig = `${lobbyId}_${data.drawerUserId}_${safeWord}`;
                    
                    const storedSig = sessionStorage.getItem('currentRoundSignature');

                    if (currentSig !== storedSig) {
                        setTimeout(() => {
                            showRoundModal(data.drawerUserId, data.word);
                        }, 300);
                        sessionStorage.setItem('currentRoundSignature', currentSig);
                    } else {
                        console.log("🔄 새로고침 감지됨: 모달 생략");
                    }
                  }
                }
              } else {
              setIsGameStarted(false);
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
            updateRoundSignature(targetDrawerId, targetWord);
            prevDrawerIdRef.current = String(targetDrawerId);
            isFirstSocketUpdate.current = false;
          }

          if (data.type === 'ROUND_START') {
            setRoundEndTime(data.roundEndTime);
            if (currentDrawerId) {
              updateRoundSignature(currentDrawerId, data.roundEndTime);
            }
          }

          if (data.type === 'DRAWER_CHANGED') {
            if (String(prevDrawerIdRef.current) === String(userId)) {
              saveMyDrawing(keywordRef.current);
            }

            setRoundFinished(false);
            setWinnerId(null);
            setRoundEndTime(0);
            setAnswerModal({ visible: false, winner: '', answer: '' });
            setTimeOverModal(false);

            resetCanvasLocal();

            const targetDrawerId = data.drawerUserId || data.drawerId;
            const targetWord = data.word || data.keyword || '???';

            updateDrawerState(targetDrawerId, targetWord, 0);
            showRoundModal(targetDrawerId, targetWord);
            updateRoundSignature(targetDrawerId, targetWord);

            if (String(targetDrawerId) === String(userId)) {
              stompRef.current?.publish({
                destination: `/app/draw/${lobbyId}/clear`,
                body: JSON.stringify({ userId }),
              });

              setPenColor('#000000ff');
              setActiveTool('pen');
            }
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
            const totalRounds = data.totalRounds || 3;
            navigate(`/vote/${lobbyId}`, { 
              state: { 
                players: playersRef.current,
                totalRounds: totalRounds
              }
            }); 
          }
        });

        const subDraw = client.subscribe(`/topic/lobby/${lobbyId}/draw`, (msg) => {
            const evt = JSON.parse(msg.body);
            applyRemoteDraw(evt);
          });

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

          try {
            client.publish({
              destination: `/app/lobby/${lobbyId}/join`,
              body: JSON.stringify({ userId, nickname }),
            });
          } catch (e) {
            console.warn("join publish 실패:", e);
          }
        },

        onStompError: (frame) => {
          console.error("STOMP error:", frame?.headers?.message || frame);
        },
        onWebSocketError: (evt) => {
          console.warn("WebSocket error:", evt);
        },
        onWebSocketClose: () => {
          connectedRef.current = false;
          reconnectingRef.current = true;
          console.warn("WebSocket closed (reconnecting...)");
        },
        onDisconnect: () => {
          connectedRef.current = false;
          console.warn("STOMP disconnected");
        },
      });

      stompRef.current = client;
      client.activate();
    }; 

    connect();

    return () => {
      isMounted = false;
      Object.values(bubbleTimeoutRef.current).forEach((t) => clearTimeout(t));
      bubbleTimeoutRef.current = {};

      if (stompRef.current) {
        safeDeactivate(stompRef.current);
        stompRef.current = null;
      }
    };
  }, [lobbyId, userId, nickname, navigate]);

  useEffect(() => {
    if (!isGameStarted || !roundEndTime) return;

    const GAME_DURATION = 60000;
    let rafId;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = roundEndTime - now;

      if (!timerBarRef.current) {
          return;
      }

      if (remaining <= 0) {
        timerBarRef.current.style.width = '0%';
        return;
      }

      const percent = Math.max(0, (remaining / GAME_DURATION) * 100);
      timerBarRef.current.style.width = `${percent}%`;

      const seconds = Math.max(0, Math.ceil(remaining / 1000));
      setRemainingSeconds(seconds);
      
      rafId = requestAnimationFrame(updateTimer);
    };

    updateTimer();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [roundEndTime, isGameStarted]);

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

  useEffect(() => {
  const handleGlobalKeyDown = (e) => {
    if (e.key !== "Enter") return;

    const input = chatInputRef.current;
    if (!input) return;

    if (document.activeElement === input) return;

    e.preventDefault();
    input.focus();
  };

  window.addEventListener("keydown", handleGlobalKeyDown);
  return () => window.removeEventListener("keydown", handleGlobalKeyDown);
}, []);

  const renderUser = (u, index) => {
    const profileValue = u?.profileImage || "default";
    
    // ✅ 조건 확인: 나인지? / 현재 출제자인지?
    const isMe = u && String(u.userId) === String(userId);
    const isCurrentDrawer = u && String(u.userId) === String(currentDrawerId);
    const isWinner = u && String(u.userId) === String(winnerId);

    return (
      <div
        key={index}
        // ✅ 클래스 추가: me, drawer, winner
        className={`user-card ${!u ? 'empty' : ''} ${isMe ? 'me' : ''} ${isCurrentDrawer ? 'drawer' : ''} ${isWinner ? 'winner' : ''}`}
        ref={(el) => { if (u && el) userCardRefs.current[u.userId] = el; }}
      >
        {/* ✅ 출제자일 경우 붓 아이콘 뱃지 표시 */}
        {isCurrentDrawer && <div className="drawer-badge">🎨</div>}

        <div className="avatar">
           {u && (
             <img 
               src={getProfileImgPath(profileValue)}
               alt="profile"
               style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
             />
           )}
        </div>
        
        <div className="user-info" style={{ textAlign: 'center', marginTop: '2px' }}>
            <span className="username" style={{ 
                display: 'block', 
                fontWeight: 'bold', 
                fontSize: '0.9rem', 
                color: '#333'  
            }}>
              {/* 이름 옆에 ★ 표시는 제거하거나 유지하셔도 됩니다 (뱃지가 있어서 중복일 수 있음) */}
              {u ? u.nickname : 'Empty'}
            </span>
            {u && (
              <span className="user-score" style={{ 
                  display: 'block', 
                  fontSize: '0.8rem', 
                  color: '#1971c2', 
                  fontWeight: 'bold',
                  marginTop: '0px'
              }}>
                Score: {u.score || 0}
              </span>
            )}
        </div>
      </div>
    );
  };

  return (
    <div className="game-wrapper">

      {gameOverModal && createPortal(
        <div className="answer-modal-overlay" style={{ zIndex: 99999 }}>
          <div className="answer-modal-content">
            <div className="confetti" style={{ fontSize: '3rem' }}>🗳️</div>
            <h2>게임 종료!</h2>
            <div className="modal-info">
              <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                모든 라운드가 끝났습니다.
              </p>
              <p style={{ marginTop: '10px', color: '#666' }}>
                잠시 후 투표 결과 페이지로 이동합니다...
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {forceExitModal && createPortal(
        <div className="answer-modal-overlay" style={{ zIndex: 99999 }}>
          <div className="answer-modal-content">
            <div className="confetti" style={{ fontSize: '3rem' }}>🥹</div>
            <h2>게임 종료</h2>
            <div className="modal-info">
              <p style={{ fontSize: '1.1rem', marginBottom: '10px' }}>
                모든 플레이어가 나갔습니다.<br />
                대기실로 돌아갑니다.
              </p>
              <button
                className="confirm-btn"
                onClick={handleLeaveGame}
                style={{
                  marginTop: '15px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#1971c2',
                  color: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
       
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
                    제시어: <span className="highlight-text">{roundModal.word}</span>
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
             
             <div className="user-column left" style={{gap: "20px"}}>
                {leftUsers.map((u, i) => renderUser(u, i * 2))}
             </div>

             <div className="center-board-area">
                <div className="board-wrapper">
                    <div className="canvas-group">
                        {isGameStarted && (
                          <div className="timer-container">
                            <div ref={timerBarRef} className="timer-bar"></div>

                            {remainingSeconds !== null && (
                              <div className="timer-seconds">
                                {remainingSeconds}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="drawingBoard" style={{ backgroundImage: "url('/img/board.png')" }}>
                           <canvas
                             ref={canvasRef}
                             className="canvas"
                             width={746} height={603}
                             onMouseDown={startDraw} 
                             onMouseMove={handleCursorMove} 
                             onMouseUp={endDraw} 
                             onMouseEnter={handleCursorEnter}
                             onMouseLeave={handleCursorLeave}
                           />
                        </div>
                    </div>

                    {isDrawer && (
                       <div className="tool-container">
                          {keyword && (
                            <div className="keyword-badge">
                              제시어: <strong>{keyword}</strong>
                            </div>
                          )}
                          <div className="tool-box">
                            <div className="tool-wrapper">
                              <div 
                                className={`tool-btn ${activeTool === 'pen' ? 'active' : ''}`} 
                                onClick={() => handleToolClick('pen')}
                              >
                                <PenIcon color={penColor} />
                              </div>
                             {showModal && activeTool === 'pen' && (
                                <div className="settings-popover">
                                  <PenSettings 
                                    color={penColor} setColor={setPenColor} 
                                    width={penWidth} setWidth={setPenWidth} 
                                    onClose={() => setShowModal(false)} 
                                  />
                                </div>
                              )}
                            </div>

                            <div className="tool-wrapper">
                              <div 
                                className={`tool-btn ${activeTool === 'fill' ? 'active' : ''}`} 
                                onClick={() => handleToolClick('fill')}
                              >
                                <img src="/svg/fill.svg" alt="fill" />
                              </div>
                              {showModal && activeTool === 'fill' && (
                                <div className="settings-popover">
                                  <FillSettings 
                                    color={fillColor} setColor={setFillColor} 
                                    onClose={() => setShowModal(false)} 
                                  />
                                </div>
                              )}
                            </div>
                             
                            <div className="tool-wrapper">
                              <div 
                                className={`tool-btn ${activeTool === 'eraser' ? 'active' : ''}`} 
                                onClick={() => handleToolClick('eraser')}
                              >
                                <img src="/svg/eraser.svg" alt="eraser" />
                              </div>
                              {showModal && activeTool === 'eraser' && (
                                <div className="settings-popover">
                                  <EraserSettings 
                                    width={eraserWidth} setWidth={setEraserWidth} 
                                    onClose={() => setShowModal(false)} 
                                  />
                                </div>
                              )}
                            </div>

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
             
             <div className="user-column right" style={{gap: "30px"}}>
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
            ref={chatInputRef}
            placeholder="메시지를 입력하세요..."
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)} 
            onKeyDown={(e) => { 
                if (e.nativeEvent.isComposing) return; 
                if (e.key === 'Enter') handleSendChat(); 
              }}
            />
          <button onClick={handleSendChat}>전송</button>
       </div>
       <div
         ref={customCursorRef}
         className='custom-cursor'
         style={{
          width : activeTool === 'eraser' ? eraserWidth : penWidth,
          height : activeTool === 'eraser' ? eraserWidth : penWidth,
          display : activeTool === 'Fill' ? 'none' : undefined
         }}>
       </div>
    </div>
  );
}

export default GameScreen;