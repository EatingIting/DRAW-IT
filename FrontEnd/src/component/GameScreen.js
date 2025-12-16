import { useRef, useState, useEffect } from 'react';
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
   HEX → RGBA (유지)
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
     WebSocket 유저
  ========================= */
  const [players, setPlayers] = useState([]);
  const stompRef = useRef(null);

  useEffect(() => {
    console.log('🧪 GameScreen localStorage 체크');
    console.log('userId:', localStorage.getItem('userId'));
    console.log('nickname:', localStorage.getItem('nickname'));
    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),
      reconnectDelay: 5000,
    });

    client.onConnect = () => {
      client.subscribe(`/topic/lobby/${lobbyId}/users`, (msg) => {
        const users = JSON.parse(msg.body);
        setPlayers(users);
        console.log('users from socket:', users);
      });

      client.publish({
        destination: `/app/lobby/${lobbyId}/join`,
        body: JSON.stringify({
          userId: localStorage.getItem('userId'),
          nickname: localStorage.getItem('nickname'),
        }),
      });
    };

    client.activate();
    stompRef.current = client;

    return () => client.deactivate();
  }, [lobbyId]);

  /* =========================
     도구 상태
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
     캔버스 / 그리기
  ========================= */
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);

  const cursorRef = useRef(null);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctxRef.current = ctx;
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

  const floodFill = (startX, startY, fillColorHex) => {
  const canvas = canvasRef.current;
  const ctx = ctxRef.current;
  const width = canvas.width;
  const height = canvas.height;

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixelData = imageData.data;

  const startPos = (startY * width + startX) * 4;
  const startR = pixelData[startPos];
  const startG = pixelData[startPos + 1];
  const startB = pixelData[startPos + 2];
  const startA = pixelData[startPos + 3];

  const [fillR, fillG, fillB, fillA] = hexToRgba(fillColorHex);

    if (
      startR === fillR &&
      startG === fillG &&
      startB === fillB &&
      startA === fillA
    ) {
      return;
    }

    const stack = [[startX, startY]];

    while (stack.length > 0) {
      const [x, y] = stack.pop();
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const pos = (y * width + x) * 4;

      if (
        pixelData[pos] === startR &&
        pixelData[pos + 1] === startG &&
        pixelData[pos + 2] === startB &&
        pixelData[pos + 3] === startA
      ) {
        pixelData[pos] = fillR;
        pixelData[pos + 1] = fillG;
        pixelData[pos + 2] = fillB;
        pixelData[pos + 3] = fillA;

        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
        stack.push([x + 1, y + 1]);
        stack.push([x - 1, y - 1]);
        stack.push([x - 1, y + 1]);
        stack.push([x + 1, y - 1]);
      }
    }

    ctx.putImageData(imageData, 0, 0);
  };


  const startDraw = (e) => {
    const x = Math.floor(e.nativeEvent.offsetX);
    const y = Math.floor(e.nativeEvent.offsetY);

    if (activeTool === 'fill') {
      floodFill(x, y, fillColor);
      return;
    }

    ctxRef.current.beginPath();
    ctxRef.current.moveTo(x, y);
    drawing.current = true;
  };

  const draw = (e) => {
    if (cursorRef.current) {
      cursorRef.current.style.left = `${e.clientX}px`;
      cursorRef.current.style.top = `${e.clientY}px`;
    }

    if (!drawing.current) return;
    ctxRef.current.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctxRef.current.stroke();
  };

  const endDraw = () => {
    ctxRef.current.closePath();
    drawing.current = false;
  };

  const clearCanvas = () => {
    const c = canvasRef.current;
    ctxRef.current.clearRect(0, 0, c.width, c.height);
  };

  /* =========================
     커스텀 커서
  ========================= */
  const cursorSize = activeTool === 'eraser' ? eraserWidth : penWidth;
  const [r, g, b, a] = hexToRgba(activeTool === 'fill' ? fillColor : penColor);
  const cursorColor =
    activeTool === 'eraser'
      ? 'rgba(255,255,255,0.6)'
      : `rgba(${r},${g},${b},${a / 255})`;

  /* =========================
     유저 슬롯
  ========================= */
  const slots = Array.from({ length: maxPlayers }, (_, i) => players[i] || null);
  const half = Math.ceil(maxPlayers / 2);

  const renderUser = (u, i) => (
    <div key={i} className={`user-card ${!u ? 'empty' : ''}`}>
      <div className="avatar" />
      <span className="username">{u ? u.nickname : 'Empty'}</span>
    </div>
  );

  /* =========================
     렌더링
  ========================= */
  return (
    <div className="game-wrapper">

      {/* 원형 커서 */}
      <div
        ref={cursorRef}
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          zIndex: 9999,
          transform: 'translate(-50%, -50%)',
          width: cursorSize,
          height: cursorSize,
          borderRadius: '50%',
          border: '1px solid #000',
          backgroundColor: cursorColor,
          display: hovering ? 'block' : 'none',
        }}
      />

      <button className="back-btn" onClick={() => navigate(-1)}>
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="4" fill="none">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="game-area">
        <div className="game-grid">

          <div className="user-column left">{slots.slice(0, half).map(renderUser)}</div>

          <div className="center-board-area">

            <div className="drawingBoard" style={{ backgroundImage: "url('/img/board.png')" }}>
              <canvas
                ref={canvasRef}
                className="canvas"
                width={746}
                height={603}
                style={{ cursor: 'none' }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
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

              <div className={`tool-btn ${activeTool === 'pen' ? 'active' : ''}`}
                   onClick={() => handleToolClick('pen')}>
                <PenIcon color={penColor} />
              </div>

              <div className={`tool-btn ${activeTool === 'fill' ? 'active' : ''}`}
                   onClick={() => handleToolClick('fill')}>
                <img src="/svg/fill.svg" alt="fill" />
              </div>

              <div className={`tool-btn ${activeTool === 'eraser' ? 'active' : ''}`}
                   onClick={() => handleToolClick('eraser')}>
                <img src="/svg/eraser.svg" alt="eraser" />
              </div>

              {/* ✅ 전체 삭제 버튼 복구 */}
              <div className="tool-btn delete-btn" onClick={clearCanvas} title="전체 지우기">
                🗑
              </div>

            </div>
          </div>

          <div className="user-column right">{slots.slice(half).map(renderUser)}</div>

        </div>
      </div>
    </div>
  );
}

export default GameScreen;
