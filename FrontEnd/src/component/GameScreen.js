import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

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

  const alertedRef = useRef(false);

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
  const lastPointRef = useRef(null);

  // ✅ [수정] 화면 비율 저장용 (렉 방지)
  const scaleRef = useRef({ x: 1, y: 1 });

  /* =========================
      Tool State
  ========================= */
  const [activeTool, setActiveTool] = useState('pen');
  const [showModal, setShowModal] = useState(false);

  const [penColor, setPenColor] = useState('#000000ff');
  const [penWidth, setPenWidth] = useState(5);
  const [fillColor, setFillColor] = useState('#ff0000ff');
  const [eraserWidth, setEraserWidth] = useState(20);

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

          const applyDrawer = (drawerUserId) => {
            if (!drawerUserId) return;

            const me = String(drawerUserId) === String(userId);
            setIsDrawer(me);

            if (me && !alertedRef.current) {
              alertedRef.current = true;
              setTimeout(() => {
                alert('주제어에 맞는 그림을 그려주세요!');
              }, 0);
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
            alertedRef.current = false;
            applyDrawer(data.drawerUserId);
          }

          if (data.type === 'DRAWER_CHANGED') {
            alertedRef.current = false;
            applyDrawer(data.drawerUserId);
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

        // ✅ [수정] 히스토리 구독 (내 ID 전용 토픽 + 캔버스 준비 체크)
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
            // 타이머 완료 후 Ref에서도 제거 (메모리 관리)
            delete bubbleTimeoutRef.current[uid]; 
          }, 3000);

          // 저장해둬야 다음 메시지 올 때 취소 가능
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
      Canvas Init
  ========================= */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctxRef.current = ctx;

    // ✅ [수정] 캔버스 준비 완료 처리 및 대기 중인 히스토리 그리기
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
    // ✅ [수정] 히스토리는 내가 그렸던 것도 다시 그려야 함
    if (!isHistory && String(evt.userId) === String(userId)) return;

    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    if (evt.type === 'CLEAR') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      lastPointRef.current = null;
      return;
    }

    if (evt.type === 'FILL') {
      floodFill(evt.x, evt.y, evt.color);
      return;
    }

    // 도구 설정 복원
    if (evt.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = evt.color;
    }
    // ✅ [확인] 백엔드에서 width로 줬다면 width, lineWidth라면 lineWidth (보통 통일하는게 좋음)
    // 여기서는 백엔드가 주는 값 그대로 사용 (수신부는 유연하게)
    ctx.lineWidth = evt.lineWidth || evt.width || 5;

    if (evt.type === 'START') {
      ctx.beginPath();
      ctx.moveTo(evt.x, evt.y);
      lastPointRef.current = { x: evt.x, y: evt.y };
      return;
    }

    if (evt.type === 'MOVE') {
      // START 유실 대비
      if (!lastPointRef.current) {
        ctx.beginPath();
        ctx.moveTo(evt.x, evt.y);
      } else {
        ctx.lineTo(evt.x, evt.y);
        ctx.stroke();
      }
      lastPointRef.current = { x: evt.x, y: evt.y };
      return;
    }

    if (evt.type === 'END') {
      ctx.closePath();
      lastPointRef.current = null;
    }
  };

  /* =========================
      Local Draw (Optimized)
  ========================= */
  
  // ✅ [수정] 비율 계산 함수 (그리기 시작할 때 한 번만 호출)
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

    // ✅ 클릭 시점 비율 계산 (최적화)
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
      // ✅ [수정] 변수명 width -> lineWidth 로 통일 (백엔드 호환)
      lineWidth: activeTool === 'eraser' ? eraserWidth : penWidth,
    });
  };

  const draw = (e) => {
    if (!isDrawer || !drawing.current) return;

    // ✅ 저장된 비율 사용 (연산 최소화)
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
      // ✅ [수정] 변수명 width -> lineWidth 로 통일
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
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
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