import { useRef, useState, useEffect, useCallback } from 'react';
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

/* =========================
   HEX → RGBA
========================= */
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
  const { lobbyId } = useParams();

  /* =========================
      WebSocket / User
  ========================= */
  const stompRef = useRef(null);
  const leftingRef = useRef(false);

  const userId = localStorage.getItem('userId');
  const nickname = localStorage.getItem('nickname');

  const [players, setPlayers] = useState([]);
  const [isDrawer, setIsDrawer] = useState(false);

  /* =========================
      Leave
  ========================= */
  const publishLeave = useCallback(() => {
    const client = stompRef.current;
    if (!client?.connected || leftingRef.current) return;
    leftingRef.current = true;

    client.publish({
      destination: `/app/lobby/${lobbyId}/leave`,
      body: JSON.stringify({ userId }),
    });
  }, [lobbyId, userId]);

  /* =========================
      Canvas Refs & Scales
  ========================= */
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const isRemoteDrawing = useRef(false); 
  const scaleRef = useRef({ x: 1, y: 1 });

  /* =========================
      Tool State (Persistent)
  ========================= */
  const [activeTool, setActiveTool] = useState(() => localStorage.getItem('activeTool') || 'pen');
  const [showModal, setShowModal] = useState(false);

  const [penColor, setPenColor] = useState(() => localStorage.getItem('penColor') || '#000000ff');
  const [penWidth, setPenWidth] = useState(() => Number(localStorage.getItem('penWidth')) || 5);
  const [fillColor, setFillColor] = useState(() => localStorage.getItem('fillColor') || '#ff0000ff');
  const [eraserWidth, setEraserWidth] = useState(() => Number(localStorage.getItem('eraserWidth')) || 20);

  useEffect(() => {
    localStorage.setItem('activeTool', activeTool);
    localStorage.setItem('penColor', penColor);
    localStorage.setItem('penWidth', penWidth);
    localStorage.setItem('fillColor', fillColor);
    localStorage.setItem('eraserWidth', eraserWidth);
  }, [activeTool, penColor, penWidth, fillColor, eraserWidth]);

  const handleToolClick = (tool) => {
    if (activeTool === tool) {
      setShowModal((prev) => !prev);
    } else {
      setActiveTool(tool);
      setShowModal(true);
    }
  };

  /* =========================
      Chat Bubble
  ========================= */
  const [chatBubbles, setChatBubbles] = useState({});
  const userCardRefs = useRef({});
  const [chatMessage, setChatMessage] = useState('');
  const bubbleTimeoutRef = useRef({});

  const handleSendChat = () => {
    if (!chatMessage.trim()) return;

    stompRef.current?.publish({
      destination: '/app/chat/bubble',
      body: JSON.stringify({
        lobbyId,
        userId,
        message: chatMessage,
      }),
    });

    setChatMessage('');
  };

  /* ========================
      History Buffer
  ========================*/
  const pendingHistoryRef = useRef([]);
  const canvasReadyRef = useRef(false);

  /* =========================
      Canvas 초기화 함수 (로컬)
  ========================= */
  const resetCanvasLocal = () => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    isRemoteDrawing.current = false;
  };

  /* =========================
      Initial Data Fetch
  ========================= */
  useEffect(() => {
    const fetchGameData = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/lobby/${lobbyId}`);
        const data = res.data?.lobby ?? res.data;

        if (data && data.users) {
          const hostId = data.hostUserId;
          const mappedUsers = data.users.map((u) => ({
            ...u,
            host: String(u.userId) === String(hostId),
          }));

          mappedUsers.sort((a, b) => {
            if (a.host && !b.host) return -1;
            if (!a.host && b.host) return 1;
            return 0;
          });

          setPlayers(mappedUsers);
          
          if (data.gameStarted && data.drawerUserId) {
             const me = String(data.drawerUserId) === String(userId);
             setIsDrawer(me);
          }
        }
      } catch (err) {
        console.error("초기 데이터 로드 실패:", err);
      }
    };

    fetchGameData();
  }, [lobbyId, userId]);


  /* =========================
      WebSocket Connect
  ========================= */
  useEffect(() => {
    if (!userId || !nickname) {
      navigate('/join');
      return;
    }

    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),
      reconnectDelay: 3000,
      onConnect: () => {
        client.subscribe(`/topic/lobby/${lobbyId}`, (msg) => {
          const data = JSON.parse(msg.body);

          // ✅ [핵심] 출제자 적용 로직
          const applyDrawer = (drawerUserId) => {
            if (!drawerUserId) return;

            const me = String(drawerUserId) === String(userId);
            setIsDrawer(me);

            if (me) {
              // 1. [로컬] 펜 설정 초기화 (검은색 펜)
              setPenColor('#000000ff');
              setActiveTool('pen');
              
              // 2. [로컬] Context 강제 초기화 (즉시 반영)
              if (ctxRef.current) {
                ctxRef.current.globalCompositeOperation = 'source-over';
                ctxRef.current.strokeStyle = '#000000ff';
                ctxRef.current.lineWidth = 5; 
              }

              // 3. ✅ [추가/중요] 새 출제자가 "모두의 캔버스를 지워라" 명령 전송
              //    이것이 Viewer들의 화면을 초기화시키는 결정타입니다.
              client.publish({
                destination: `/app/draw/${lobbyId}/clear`,
                body: JSON.stringify({ userId }), // 내 ID로 보냄
              });

              // 4. 알림 처리
              const hasAlerted = sessionStorage.getItem(`hasAlertedDrawer_${lobbyId}`);
              if (!hasAlerted) {
                setTimeout(() => {
                  alert('당신이 출제자 입니다! 제시어에 맞게 그림을 그려주세요.');
                  sessionStorage.setItem(`hasAlertedDrawer_${lobbyId}`, 'true');
                }, 0);
              }
            } else {
              sessionStorage.removeItem(`hasAlertedDrawer_${lobbyId}`);
            }
          };

          if (data.type === 'USER_UPDATE') {
            const hostId = data.hostUserId;
            const mappedUsers = (data.users || []).map((u) => ({
              ...u,
              host: String(u.userId) === String(hostId),
            }));

            mappedUsers.sort((a, b) => {
              if (a.host && !b.host) return -1;
              if (!a.host && b.host) return 1;
              return 0;
            });

            setPlayers(mappedUsers);

            if (data.gameStarted && data.drawerUserId) {
              applyDrawer(data.drawerUserId);
            }
          }

          if (data.type === 'GAME_START') {
            sessionStorage.removeItem(`hasAlertedDrawer_${lobbyId}`);
            resetCanvasLocal(); // 일단 로컬 캔버스 비우기
            applyDrawer(data.drawerUserId); // 새 출제자 로직 실행
          }

          if (data.type === 'DRAWER_CHANGED') {
            resetCanvasLocal(); // 일단 로컬 캔버스 비우기
            applyDrawer(data.drawerUserId); // 새 출제자 로직 실행
          }

          if (data.type === 'ROOM_DESTROYED') {
            alert('방이 삭제되었습니다.');
            navigate('/join');
          }
        });

        client.subscribe(`/topic/lobby/${lobbyId}/draw`, (msg) => {
          const evt = JSON.parse(msg.body);
          applyRemoteDraw(evt);
        });

        client.subscribe(`/topic/history/${userId}`, (msg) => {
          const history = JSON.parse(msg.body);

          if (canvasReadyRef.current) {
            history.forEach((evt) => {
              applyRemoteDraw(evt, true);
            });
          } else {
            pendingHistoryRef.current = history;
          }
        });

        client.publish({
          destination: `/app/draw/${lobbyId}/history`,
        });

        client.publish({
          destination: `/app/lobby/${lobbyId}/join`,
          body: JSON.stringify({ userId, nickname }),
        });

        client.subscribe('/topic/chat/bubble', (msg) => {
          const data = JSON.parse(msg.body);
          if (data.type !== 'CHAT_BUBBLE') return;

          const uid = data.userId;

          setChatBubbles((prev) => ({
            ...prev,
            [uid]: data.message,
          }));

          const timeoutId = setTimeout(() => {
            setChatBubbles((prev) => {
              const copy = { ...prev };
              delete copy[uid];
              return copy;
            });
            delete bubbleTimeoutRef.current[uid]; 
          }, 3000);

          bubbleTimeoutRef.current[uid] = timeoutId;
        });
      },
    });

    client.activate();
    stompRef.current = client;

    return () => {
      publishLeave();
      client.deactivate();
    };
  }, [lobbyId, navigate, publishLeave, userId, nickname]);

  /* =========================
      Canvas Init & Tool Sync
  ========================= */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctxRef.current = ctx;
    canvasReadyRef.current = true;

    if (pendingHistoryRef.current.length > 0) {
      pendingHistoryRef.current.forEach((evt) => {
        applyRemoteDraw(evt, true);
      });
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

  /* =========================
      Draw Sync
  ========================= */
  const publishDraw = (evt) => {
    stompRef.current?.publish({
      destination: `/app/draw/${lobbyId}`,
      body: JSON.stringify({ ...evt, userId }),
    });
  };

  const applyRemoteDraw = (evt, isHistory = false) => {
    if (!isHistory && String(evt.userId) === String(userId)) return;

    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    // ✅ CLEAR 수신 시 모든 클라이언트가 캔버스 초기화
    if (evt.type === 'CLEAR') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      isRemoteDrawing.current = false;
      return;
    }

    if (evt.type === 'FILL') {
      floodFill(evt.x, evt.y, evt.color);
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
    }

    if (evt.type === 'MOVE') {
      if (!isRemoteDrawing.current) {
        ctx.beginPath();
        ctx.moveTo(evt.x, evt.y);
        isRemoteDrawing.current = true;
      } else {
        ctx.lineTo(evt.x, evt.y);
        ctx.stroke();
      }
    }

    if (evt.type === 'END') {
      ctx.closePath();
      isRemoteDrawing.current = false;
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

  /* =========================
      Local Draw
  ========================= */
  const calculateScale = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    scaleRef.current = {
      x: canvas.width / rect.width,
      y: canvas.height / rect.height,
    };
  };

  const startDraw = (e) => {
    if (!isDrawer) return;
    calculateScale();

    const x = e.nativeEvent.offsetX * scaleRef.current.x;
    const y = e.nativeEvent.offsetY * scaleRef.current.y;

    if (activeTool === 'fill') {
      floodFill(x, y, fillColor);
      publishDraw({
        type: 'FILL',
        x,
        y,
        color: fillColor,
      });
      return;
    }

    drawing.current = true;
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(x, y);

    publishDraw({
      type: 'START',
      x,
      y,
      tool: activeTool,
      color: penColor,
      lineWidth: activeTool === 'eraser' ? eraserWidth : penWidth,
    });
  };

  const draw = (e) => {
    if (!isDrawer || !drawing.current) return;

    const x = e.nativeEvent.offsetX * scaleRef.current.x;
    const y = e.nativeEvent.offsetY * scaleRef.current.y;

    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();

    publishDraw({
      type: 'MOVE',
      x,
      y,
      tool: activeTool,
      color: penColor,
      lineWidth: activeTool === 'eraser' ? eraserWidth : penWidth,
    });
  };

  const endDraw = () => {
    if (!drawing.current) return;
    drawing.current = false;
    ctxRef.current.closePath();
    publishDraw({ type: 'END' });
  };

  const clearCanvas = () => {
    if (!isDrawer) return;
    const ctx = ctxRef.current;
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    stompRef.current?.publish({
      destination: `/app/draw/${lobbyId}/clear`,
      body: JSON.stringify({ userId }),
    });
  };

  /* =========================
      Flood Fill
  ========================= */
  const floodFill = (x, y, color) => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;
    const [r, g, b, a] = hexToRgba(color);

    const idx = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
    const target = data.slice(idx, idx + 4);
    if (
      target[0] === r &&
      target[1] === g &&
      target[2] === b &&
      target[3] === a
    )
      return;

    const stack = [[Math.floor(x), Math.floor(y)]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height)
        continue;
      const i = (cy * canvas.width + cx) * 4;
      if (
        data[i] === target[0] &&
        data[i + 1] === target[1] &&
        data[i + 2] === target[2] &&
        data[i + 3] === target[3]
      ) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
    }
    ctx.putImageData(img, 0, 0);
  };

  /* =========================
      Render
  ========================= */
  const slots = Array.from({ length: maxPlayers }, (_, i) => players[i] || null);
  const half = Math.ceil(maxPlayers / 2);

  const renderUser = (u, i) => (
    <div
      key={i}
      className={`user-card ${!u ? 'empty' : ''}`}
      ref={(el) => {
        if (u && el) userCardRefs.current[u.userId] = el;
      }}
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
      <button className="back-btn" onClick={() => navigate('/join')}>
        <svg
          viewBox="0 0 24 24"
          width="32"
          height="32"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="game-area">
        <div className="game-grid">
          <div className="user-column left">
            {slots.slice(0, half).map(renderUser)}
          </div>

          <div className="center-board-area">
            <div
              className="drawingBoard"
              style={{ backgroundImage: "url('/img/board.png')" }}
            >
              <canvas
                ref={canvasRef}
                className="canvas"
                width={746}
                height={603}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
              />
            </div>

            {isDrawer && (
              <div className="tool-box">
                {showModal && activeTool === 'pen' && (
                  <PenSettings
                    color={penColor}
                    setColor={setPenColor}
                    width={penWidth}
                    setWidth={setPenWidth}
                    onClose={() => setShowModal(false)}
                  />
                )}
                {showModal && activeTool === 'fill' && (
                  <FillSettings
                    color={fillColor}
                    setColor={setFillColor}
                    onClose={() => setShowModal(false)}
                  />
                )}
                {showModal && activeTool === 'eraser' && (
                  <EraserSettings
                    width={eraserWidth}
                    setWidth={setEraserWidth}
                    onClose={() => setShowModal(false)}
                  />
                )}

                <div 
                  className={`tool-btn ${activeTool === 'pen' ? 'active' : ''}`} 
                  onClick={() => handleToolClick('pen')}>
                  <PenIcon color={penColor} />
                </div>
                <div 
                  className={`tool-btn ${activeTool === 'fill' ? 'active' : ''}`} 
                  onClick={() => handleToolClick('fill')}>
                  <img src="/svg/fill.svg" alt="fill" />
                </div>
                <div 
                  className={`tool-btn ${activeTool === 'eraser' ? 'active' : ''}`} 
                  onClick={() => handleToolClick('eraser')}>
                  <img src="/svg/eraser.svg" alt="eraser" />
                </div>
                <div className="tool-btn delete-btn" onClick={clearCanvas}>
                  🗑
                </div>
              </div>
            )}
          </div>

          <div className="user-column right">
            {slots.slice(half).map(renderUser)}
          </div>
        </div>
      </div>

      {Object.entries(chatBubbles).map(([uid, msg]) => {
        const el = userCardRefs.current[uid];
        if (!el) return null;

        const rect = el.getBoundingClientRect();

        return (
          <div
            key={uid}
            className="chat-bubble-float"
            style={{
              position: 'fixed',
              top: rect.top + rect.height / 2,
              left: rect.right + 12,
              transform: 'translateY(-50%)',
              zIndex: 9999,
              maxWidth: '220px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              pointerEvents: 'none',
            }}
          >
            {msg}
          </div>
        );
      })}
      <div className="chat-area">
        <input
          type="text"
          placeholder="메시지를 입력하세요..."
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendChat();
          }}
        />
        <button onClick={handleSendChat}>전송</button>
      </div>
    </div>
  );
}

export default GameScreen;