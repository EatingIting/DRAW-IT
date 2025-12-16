import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { nanoid } from 'nanoid';
import "./LobbyScreen.css";

function LobbyScreen() {
  const navigate = useNavigate();
  const { lobbyId: roomId } = useParams();
  const location = useLocation();

  /* =========================
     userId (재접속 핵심)
  ========================= */
  const userIdRef = useRef(
    sessionStorage.getItem("userId") ||
    (() => {
      const id = nanoid(12);
      sessionStorage.setItem("userId", id);
      return id;
    })()
  );

  /* =========================
     nickname (표시용)
  ========================= */
  const myNickname = (
    location.state?.nickname ||
    sessionStorage.getItem("nickname") ||
    ""
  ).trim();

  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const maxPlayers = 10;

  const clientRef = useRef(null);

  /* =========================
     WebSocket 연결
  ========================= */
  useEffect(() => {
    if (!myNickname) {
      alert("닉네임 정보가 없습니다.");
      navigate("/");
      return;
    }

    // React StrictMode 중복 연결 방지
    if (clientRef.current?.active) return;

    const client = new Client({
      webSocketFactory: () => new SockJS("http://172.30.1.250:8080/ws-stomp"),

      onConnect: () => {
        console.log("✅ STOMP CONNECTED");

        /* ===== 로비 구독 ===== */
        client.subscribe(`/topic/lobby/${roomId}`, (message) => {
          const data = JSON.parse(message.body);

          if (data.type === "USER_UPDATE") {
            setPlayers(data.users);

            // 방장 판정 (userId 기준)
            setIsHost(
              data.users.some(
                u => u.host === true && u.userId === userIdRef.current
              )
            );
          }

          if (data.type === "GAME_START") {
            navigate(`/gaming/${roomId}`);
          }

          if (data.type === "ROOM_DESTROYED") {
            alert("방장이 방을 삭제했습니다.");
            navigate("/");
          }
        });

        /* ===== 채팅 구독 ===== */
        client.subscribe(`/topic/lobby/${roomId}/chat`, () => {});

        /* ===== 입장 / 재접속 ===== */
        client.publish({
          destination: `/app/lobby/${roomId}/join`,
          body: JSON.stringify({
            roomId,
            userId: userIdRef.current,
            nickname: myNickname
          })
        });
      },

      onStompError: (frame) => {
        console.error("STOMP ERROR:", frame.headers["message"]);
        console.error(frame.body);
      },
    });

    client.activate();
    clientRef.current = client;

    return () => {
      if (clientRef.current) {
        clientRef.current.deactivate();
      }
    };
  }, [roomId, myNickname, navigate]);

  /* =========================
     핸들러
  ========================= */

  const handleLeaveRoom = () => {
    if (clientRef.current?.connected) {
      clientRef.current.publish({
        destination: `/app/lobby/${roomId}/leave`,
        body: JSON.stringify({
          userId: userIdRef.current
        })
      });
    }
    navigate(-1);
  };

  const handleStartGame = () => {
    if (!isHost) return;
    if (!clientRef.current?.connected) return;

    clientRef.current.publish({
      destination: `/app/lobby/${roomId}/start`,
      body: JSON.stringify({ roomId })
    });
  };

  const handleSendMessage = () => {
    if (!chatMessage.trim()) return;
    if (!clientRef.current?.connected) return;

    clientRef.current.publish({
      destination: `/app/lobby/${roomId}/chat`,
      body: JSON.stringify({
        roomId,
        userId: userIdRef.current,
        nickname: myNickname,
        content: chatMessage
      })
    });

    setChatMessage("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSendMessage();
  };

  /* =========================
     렌더링
  ========================= */
  const slots = Array.from({ length: maxPlayers }, (_, i) => players[i] || null);
  const half = Math.ceil(maxPlayers / 2);
  const leftSlots = slots.slice(0, half);
  const rightSlots = slots.slice(half);

  const renderUserCard = (user, index) => (
    <div key={index} className={`user-card ${!user ? "empty" : ""}`}>
      <div className="avatar" />
      <span className="username">
        {user ? user.nickname : "Empty"}
        {user?.host && <span style={{ color: "gold", marginLeft: 6 }}>★</span>}
      </span>
    </div>
  );

  return (
    <div className="lobby-wrapper">
      {/* 뒤로가기 (진짜 나가기) */}
      <button className="back-btn" onClick={handleLeaveRoom}>
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

      <div className="play-area">
        <div className="play-grid">
          <div className="user-column left">
            {leftSlots.map(renderUserCard)}
          </div>

          <div className="lobby-center">
            <div className="logo-placeholder">LOGO</div>

            <div className="room-info-box">
              <h2>즐거운 그림 그리기!</h2>
              <div className="room-detail">
                <span>모드: RANDOM</span>
                <span>•</span>
                <span>{players.length} / {maxPlayers} 명</span>
              </div>
            </div>

            {isHost ? (
              <div className="action-btn-group">
                <button className="start-btn" onClick={handleStartGame}>
                  GAME START
                </button>
                <button className="modify-btn">방 설정</button>
              </div>
            ) : (
              <div className="waiting-text">
                방장이 게임을 시작할 때까지<br />
                기다려 주세요!
              </div>
            )}
          </div>

          <div className="user-column right">
            {rightSlots.map(renderUserCard)}
          </div>
        </div>
      </div>

      <div className="chat-area">
        <input
          type="text"
          placeholder="메시지를 입력하세요..."
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button onClick={handleSendMessage}>전송</button>
      </div>
    </div>
  );
}

export default LobbyScreen;
