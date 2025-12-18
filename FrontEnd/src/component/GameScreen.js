import { useRef, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

import PenSettings from './settingmodals/PenSettings';
import FillSettings from './settingmodals/FillSettings';
import EraserSettings from './settingmodals/EraserSettings';
import PenIcon from './icons/PenIcon';
import './GameScreen.css';
import { API_BASE_URL } from '../api/config';

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

  const [players, setPlayers] = useState([]);
  const [isDrawer, setIsDrawer] = useState(false);
  const [keyword, setKeyword] = useState(""); 
  
  const [isGameStarted, setIsGameStarted] = useState(false);
  
  // ✅ 서버 동기화용 종료 시간
  const [roundEndTime, setRoundEndTime] = useState(0); 

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
  
  // ✅ 타이머 DOM Ref
  const timerBarRef = useRef(null);

  const handleLeaveGame = () => {
    if (stompRef.current?.connected) {
      stompRef.current.publish({
        destination: `/app/lobby/${lobbyId}/leave`,
        body: JSON.stringify({ userId }),
      });
      stompRef.current.deactivate();
    }
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
          if (data.drawerUserId) {
             const me = String(data.drawerUserId) === String(userId);
             setIsDrawer(me);
          }
        }
      } catch (err) {
        console.error("데이터 로드 실패:", err);
      }
    };
    fetchGameData();
  }, [lobbyId, userId]);

  const prevDrawerIdRef = useRef(null);

  useEffect(() => {
    if (!userId || !nickname || !lobbyId) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),
      reconnectDelay: 3000,
      onConnect: () => {
        console.log("✅ Game 소켓 연결 성공");

        client.subscribe(`/topic/lobby/${lobbyId}`, (msg) => {
          const data = JSON.parse(msg.body);

          const updateDrawerState = (newDrawerId, newWord, endTime) => {
            if (!newDrawerId) return;
            const me = String(newDrawerId) === String(userId);
            setIsDrawer(me);
            if (newWord) setKeyword(newWord);

            // ✅ 서버 시간 수신 시 업데이트
            if (endTime) {
                setRoundEndTime(endTime);
            }

            const isNewDrawer = prevDrawerIdRef.current !== String(newDrawerId);
            if (me && isNewDrawer) {
               setTimeout(() => {
                 alert(`당신이 출제자 입니다!\n주제어: [ ${newWord || "???"} ]\n그림을 그려주세요.`);
                 client.publish({
                   destination: `/app/draw/${lobbyId}/clear`,
                   body: JSON.stringify({ userId }),
                 });
               }, 100);
               setPenColor('#000000ff');
               setActiveTool('pen');
               if (ctxRef.current) {
                 ctxRef.current.globalCompositeOperation = 'source-over';
                 ctxRef.current.strokeStyle = '#000000ff';
                 ctxRef.current.lineWidth = 5; 
               }
            }
            prevDrawerIdRef.current = String(newDrawerId);
          };

          if (data.type === 'USER_UPDATE') {
            const hostId = data.hostUserId;
            const mappedUsers = (data.users || []).map((u) => ({
              ...u,
              host: String(u.userId) === String(hostId),
            })).sort((a, b) => (a.host === b.host ? 0 : a.host ? -1 : 1));
            
            setPlayers(mappedUsers);
            if (data.gameStarted) setIsGameStarted(true);

            if (data.gameStarted && mappedUsers.length < 2) {
                alert("유저가 없습니다. 세션을 종료합니다.");
                handleLeaveGame();
                return; 
            }
            
            if (data.drawerUserId) updateDrawerState(data.drawerUserId, data.word, data.roundEndTime);
          }

          if (data.type === 'GAME_START') {
            setIsGameStarted(true);
            resetCanvasLocal();
            updateDrawerState(data.drawerUserId, data.word, data.roundEndTime);
          }

          if (data.type === 'DRAWER_CHANGED') {
            resetCanvasLocal();
            updateDrawerState(data.drawerUserId, data.word, data.roundEndTime);
          }

          if (data.type === 'ROOM_DESTROYED') {
            alert('방이 삭제되었습니다.');
            navigate('/');
          }
        });

        client.subscribe(`/topic/lobby/${lobbyId}/draw`, (msg) => {
            const evt = JSON.parse(msg.body);
            applyRemoteDraw(evt);
        });
        client.subscribe(`/topic/history/${userId}`, (msg) => {
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
        client.subscribe('/topic/chat/bubble', (msg) => {
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

        client.publish({
          destination: `/app/lobby/${lobbyId}/join`,
          body: JSON.stringify({ userId, nickname }),
        });
      },
      onStompError: (frame) => console.error("❌ 소켓 에러:", frame)
    });

    client.activate();
    stompRef.current = client;

    return () => {
      if (client) client.deactivate();
    };
    // eslint-disable-next-line
  }, [lobbyId, userId, nickname, navigate]);


  // ✅ 타이머 애니메이션 동기화
  useEffect(() => {
    if (!isGameStarted || !roundEndTime || !timerBarRef.current) return;

    const now = Date.now();
    const remainingTime = roundEndTime - now;
    const elapsed = 60000 - remainingTime;

    if (elapsed > 0 && elapsed < 60000) {
        timerBarRef.current.style.animation = 'none';
        void timerBarRef.current.offsetWidth; // Trigger reflow
        timerBarRef.current.style.animation = `shrink 60s linear forwards`;
        timerBarRef.current.style.animationDelay = `-${elapsed / 1000}s`;
    } else if (remainingTime <= 0) {
        timerBarRef.current.style.width = '0%';
    } else {
        timerBarRef.current.style.animation = `shrink 60s linear forwards`;
    }
  }, [roundEndTime, isGameStarted]);


  // ✅ 방장 타임오버 로직
  useEffect(() => {
    if (!isGameStarted || !roundEndTime) return;
    const amIHost = players.find(p => String(p.userId) === String(userId))?.host;
    if (amIHost) {
      const now = Date.now();
      const timeLeft = roundEndTime - now;

      if (timeLeft > 0) {
          const timer = setTimeout(() => {
            if (stompRef.current?.connected) {
              stompRef.current.publish({
                destination: `/app/lobby/${lobbyId}/timeover`,
                body: JSON.stringify({}),
              });
            }
          }, timeLeft);
          return () => clearTimeout(timer);
      }
    }
  }, [roundEndTime, isGameStarted, players, userId, lobbyId]);


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
    stompRef.current?.publish({
      destination: `/app/draw/${lobbyId}`,
      body: JSON.stringify({ ...evt, userId }),
    });
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
    calculateScale();
    const x = e.nativeEvent.offsetX * scaleRef.current.x;
    const y = e.nativeEvent.offsetY * scaleRef.current.y;
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
    const x = e.nativeEvent.offsetX * scaleRef.current.x;
    const y = e.nativeEvent.offsetY * scaleRef.current.y;
    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();
    currentStrokeRef.current.push({ x, y });
    publishDraw({ type: 'MOVE', x, y, tool: activeTool, color: penColor, lineWidth: activeTool === 'eraser' ? eraserWidth : penWidth });
  };
  const endDraw = () => {
    if (!drawing.current) return;
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
    stompRef.current?.publish({ destination: `/app/draw/${lobbyId}/clear`, body: JSON.stringify({ userId }) });
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
    stompRef.current?.publish({
      destination: '/app/chat/bubble',
      body: JSON.stringify({ lobbyId, userId, message: chatMessage }),
    });
    setChatMessage('');
  };

  const slots = Array.from({ length: maxPlayers }, (_, i) => players[i] || null);
  const half = Math.ceil(maxPlayers / 2);

  const renderUser = (u, i) => (
    <div
      key={i}
      className={`user-card ${!u ? 'empty' : ''}`}
      ref={(el) => { if (u && el) userCardRefs.current[u.userId] = el; }}
    >
      <div className="avatar" />
      <span className="username">
        {u ? u.nickname : 'Empty'}
        {u?.host && <span style={{ color: 'gold', marginLeft: 6 }}>★</span>}
      </span>
    </div>
  );

  return (
    <div className="game-wrapper">
       <button className="back-btn" onClick={handleLeaveGame}>
         <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
         </svg>
       </button>
       <div className="game-area">
          <div className="game-grid">
             <div className="user-column left">{slots.slice(0, half).map(renderUser)}</div>
             
             <div className="center-board-area">
                
                {/* 묶음 래퍼: 타이머, 스케치북, 도구함 */}
                <div className="board-wrapper">
                    
                    {/* 1. 캔버스 그룹 (타이머 + 스케치북) */}
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

                    {/* 2. 도구함 (우측) */}
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
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
                              </div>
                              <div className="tool-btn" onClick={handleRedo} title="Redo">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" /></svg>
                              </div>
                              <div className="tool-btn delete-btn" onClick={clearCanvas}>🗑</div>
                          </div>
                       </div>
                    )}
                </div> {/* End board-wrapper */}

             </div>
             
             <div className="user-column right">{slots.slice(half).map(renderUser)}</div>
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
          <input type="text" placeholder="메시지 입력..." value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }} />
          <button onClick={handleSendChat}>전송</button>
       </div>
    </div>
  );
}

export default GameScreen;