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
      Undo / Redo Refs (NEW)
  ========================= */
  const historyRef = useRef([]);      // 완료된 동작들 저장
  const redoStackRef = useRef([]);    // 취소된 동작들 저장
  const currentStrokeRef = useRef([]); // 현재 그리는 중인 선의 좌표들 저장

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
      Canvas 초기화 및 히스토리 리셋 함수
  ========================= */
  const resetCanvasLocal = () => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    isRemoteDrawing.current = false;
    // 게임 리셋 시 히스토리도 날립니다.
    historyRef.current = [];
    redoStackRef.current = [];
    currentStrokeRef.current = [];
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
  const prevDrawerIdRef = useRef(null);

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

          // ============================================================
          //  ★ [통합 함수] 출제자 상태 변경 및 알림 처리 (핵심 해결책)
          // ============================================================
          const updateDrawerState = (newDrawerId) => {
            if (!newDrawerId) return;

            const me = String(newDrawerId) === String(userId);
            setIsDrawer(me);

            // 1. 내가 출제자이고 + '이전 출제자'가 내가 아니었다면? -> 알림 발사!
            // (USER_UPDATE가 먼저 오든 GAME_START가 먼저 오든, 딱 한번만 실행됨)
            if (me && prevDrawerIdRef.current !== String(newDrawerId)) {
               // UI가 렌더링될 시간을 조금 줌
               setTimeout(() => {
                 alert('당신이 출제자 입니다! 제시어에 맞게 그림을 그려주세요.');
                 
                 // 캔버스 클리어 명령 전송 (새 출제자니까)
                 client.publish({
                    destination: `/app/draw/${lobbyId}/clear`,
                    body: JSON.stringify({ userId }),
                 });
               }, 100);

               // 펜 설정 초기화
               setPenColor('#000000ff');
               setActiveTool('pen');
               if (ctxRef.current) {
                 ctxRef.current.globalCompositeOperation = 'source-over';
                 ctxRef.current.strokeStyle = '#000000ff';
                 ctxRef.current.lineWidth = 5; 
               }
            }

            // 2. 현재 출제자 ID를 기록해둠 (다음 비교를 위해)
            prevDrawerIdRef.current = String(newDrawerId);
          };
          // ============================================================


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
              updateDrawerState(data.drawerUserId);
            }
          }

          if (data.type === 'GAME_START') {
            resetCanvasLocal();
            updateDrawerState(data.drawerUserId);
          }

          if (data.type === 'DRAWER_CHANGED') {
            resetCanvasLocal();
            updateDrawerState(data.drawerUserId);
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
          const data = JSON.parse(msg.body);
          const historyList = data.history || [];
          const redoList = data.redoStack || [];

          // 1. 캔버스에 그려진 그림 복구
          if (canvasReadyRef.current) {
            historyList.forEach((evt) => {
              applyRemoteDraw(evt, true);
            });
          } else {
            // 캔버스 로딩 전이면 대기열에 넣기 (Active History만)
            pendingHistoryRef.current = historyList;
          }

          redoStackRef.current = redoList;
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
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); // 성능 최적화

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
      Helper: Redraw Canvas (for Undo/Redo)
  ========================= */
  const redrawAll = () => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    // 1. 캔버스 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. 히스토리 처음부터 다시 그리기
    historyRef.current.forEach((action) => {
      if (action.type === 'CLEAR') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } else if (action.type === 'FILL') {
        floodFill(action.x, action.y, action.color);
      } else if (action.type === 'STROKE') {
        // 선 그리기 동작 복구
        ctx.beginPath();
        if (action.points && action.points.length > 0) {
          ctx.moveTo(action.points[0].x, action.points[0].y);
          for (let i = 1; i < action.points.length; i++) {
            ctx.lineTo(action.points[i].x, action.points[i].y);
          }
        }
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (action.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = 'rgba(0,0,0,1)'; // 지우개는 색상 무관
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = action.color;
        }
        ctx.lineWidth = action.lineWidth;
        ctx.stroke();
      }
    });

    // 3. 현재 도구 상태 복구 (안하면 엉뚱한 설정으로 남을 수 있음)
    if (activeTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = eraserWidth;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penWidth;
    }
  };

  /* =========================
      Draw Sync Logic
  ========================= */
  const publishDraw = (evt) => {
    stompRef.current?.publish({
      destination: `/app/draw/${lobbyId}`,
      body: JSON.stringify({ ...evt, userId }),
    });
  };

  const applyRemoteDraw = (evt, isHistory = false) => {
    // 내 이벤트이고 히스토리 로딩이 아니라면 무시
    const isMe = String(evt.userId) === String(userId);
    if (!isHistory && isMe) return;

    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    /* ------------ UNDO 처리 ------------ */
    if (evt.type === 'UNDO') {
      if (historyRef.current.length > 0) {
        const lastAction = historyRef.current.pop();
        redoStackRef.current.push(lastAction);
        redrawAll();
      }
      return;
    }

    /* ------------ REDO 처리 ------------ */
    if (evt.type === 'REDO') {
      if (redoStackRef.current.length > 0) {
        const actionToRedo = redoStackRef.current.pop();
        historyRef.current.push(actionToRedo);
        redrawAll(); 
      }
      return;
    }

    /* ------------ CLEAR 처리 ------------ */
    if (evt.type === 'CLEAR') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      isRemoteDrawing.current = false;
      
      // 기록 저장
      historyRef.current.push({ type: 'CLEAR' });
      redoStackRef.current = []; 
      return;
    }

    /* ------------ FILL 처리 ------------ */
    if (evt.type === 'FILL') {
      floodFill(evt.x, evt.y, evt.color);
      
      // 기록 저장
      historyRef.current.push({
        type: 'FILL',
        x: evt.x,
        y: evt.y,
        color: evt.color
      });
      redoStackRef.current = [];
      return;
    }

    /* ============================================================
       ★ [NEW] 점들의 집합(Points)으로 온 경우 (히스토리 재생용)
       : 백엔드에서 보내준 완성된 선 하나를 한 번에 그립니다.
    ============================================================ */
    if (evt.points && evt.points.length > 0) {
      // 1. 스타일 설정
      ctx.beginPath();
      if (evt.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = evt.color;
      }
      ctx.lineWidth = evt.lineWidth || evt.width || 5;

      // 2. 선 그리기 (Move -> Line loop)
      const first = evt.points[0];
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < evt.points.length; i++) {
        ctx.lineTo(evt.points[i].x, evt.points[i].y);
      }
      ctx.stroke();
      ctx.closePath();

      // 3. 로컬 히스토리에 저장 (나중에 Undo/Redo가 먹히기 위함)
      //    이미 그려진 상태이므로 redoStack은 초기화하지 않아도 됨(Undo시 사용됨)
      //    단, 중복 저장을 막기 위해 히스토리 로딩 중이거나 내가 아닐 때 저장
      historyRef.current.push({
        type: 'STROKE',
        tool: evt.tool,
        color: evt.color,
        lineWidth: evt.lineWidth || evt.width || 5,
        points: evt.points
      });
      
      return; // 여기서 함수 종료 (아래 START/MOVE 로직 실행 안 함)
    }

    /* ------------ 실시간 선 그리기 (START/MOVE/END) ------------ */
    // 1. 도구 설정
    if (evt.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = evt.color;
    }
    ctx.lineWidth = evt.lineWidth || evt.width || 5;

    // 2. 동작 수행
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
      
      // [Remote] 실시간 드로잉 종료 시 히스토리에 저장
      if (currentStrokeRef.current.length > 0) {
        historyRef.current.push({
          type: 'STROKE',
          tool: evt.tool,
          color: evt.color,
          lineWidth: evt.lineWidth || evt.width || 5,
          points: [...currentStrokeRef.current]
        });
        currentStrokeRef.current = [];
        redoStackRef.current = [];
      }
    }

    // 내 턴일 때 설정 복구 (원격 그리기 종료 후)
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
      Local Draw (Mouse Events)
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

    /* -- FILL TOOL -- */
    if (activeTool === 'fill') {
      floodFill(x, y, fillColor);
      
      // [Local] History 저장
      historyRef.current.push({
        type: 'FILL',
        x, y, color: fillColor
      });
      redoStackRef.current = [];

      publishDraw({
        type: 'FILL',
        x,
        y,
        color: fillColor,
      });
      return;
    }

    /* -- PEN / ERASER TOOL -- */
    drawing.current = true;
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(x, y);

    // [Local] 좌표 수집 시작
    currentStrokeRef.current = [{ x, y }];

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

    // [Local] 좌표 수집
    currentStrokeRef.current.push({ x, y });

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

    const strokePoints = [...currentStrokeRef.current];
    
    // [Local] History 저장
    if (currentStrokeRef.current.length > 0) {
      historyRef.current.push({
        type: 'STROKE',
        tool: activeTool,
        color: penColor,
        lineWidth: activeTool === 'eraser' ? eraserWidth : penWidth,
        points: [...currentStrokeRef.current]
      });
      currentStrokeRef.current = [];
      redoStackRef.current = [];
    }

    publishDraw({ 
      type: 'END', 
      tool: activeTool, 
      color: penColor, 
      lineWidth: activeTool === 'eraser' ? eraserWidth : penWidth,
      points: strokePoints
    });

    currentStrokeRef.current = [];
    redoStackRef.current = [];
  };

  const clearCanvas = () => {
    if (!isDrawer) return;
    const ctx = ctxRef.current;
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    // [Local] History 저장
    historyRef.current.push({ type: 'CLEAR' });
    redoStackRef.current = [];

    stompRef.current?.publish({
      destination: `/app/draw/${lobbyId}/clear`,
      body: JSON.stringify({ userId }),
    });
  };

  /* =========================
      Undo / Redo Handlers (NEW)
  ========================= */
  const handleUndo = () => {
    if (!isDrawer || historyRef.current.length === 0) return;

    // 1. 마지막 동작 꺼내서 Redo 스택으로 이동
    const lastAction = historyRef.current.pop();
    redoStackRef.current.push(lastAction);

    // 2. 화면 다시 그리기
    redrawAll();

    // 3. 서버에 UNDO 이벤트 전송
    publishDraw({ type: 'UNDO' });
  };

  const handleRedo = () => {
    if (!isDrawer || redoStackRef.current.length === 0) return;

    // 1. Redo 스택에서 동작 꺼내서 History로 이동
    const actionToRedo = redoStackRef.current.pop();
    historyRef.current.push(actionToRedo);

    // 2. 화면 다시 그리기
    redrawAll();

    // 3. 서버에 REDO 이벤트 전송
    publishDraw({ type: 'REDO' });
  };

  /* =========================
      Flood Fill
  ========================= */
  const floodFill = (x, y, color) => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if(!ctx || !canvas) return;
    
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
                onMouseLeave={endDraw}
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
                
                {/* --- Undo / Redo Buttons (Added) --- */}
                <div className="tool-btn" onClick={handleUndo} title="Undo">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                  </svg>
                </div>
                <div className="tool-btn" onClick={handleRedo} title="Redo">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 7v6h-6" />
                    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
                  </svg>
                </div>
                {/* ----------------------------------- */}

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
      
      {/* ... Chat Bubbles & Input Area (동일) ... */}
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