import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { nanoid } from "nanoid";
import "./LobbyScreen.css";
import { API_BASE_URL } from "../api/config";
import axios from "axios";
import CreateRoomModal from "./CreateRoomModal";

function LobbyScreen() {
  const navigate = useNavigate();
  const { lobbyId: roomId } = useParams();
  const location = useLocation();

  const userIdRef = useRef(
    sessionStorage.getItem("userId") ||
      (() => {
        const id = nanoid(12);
        sessionStorage.setItem("userId", id);
        return id;
      })()
  );

  const myNickname = (
    location.state?.nickname ||
    sessionStorage.getItem("nickname") ||
    ""
  ).trim();

  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [chatMessage, setChatMessage] = useState("");

  const [roomInfo, setRoomInfo] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  /* =========================
     ✅ Chat Bubble (추가)
  ========================= */
  const [chatBubbles, setChatBubbles] = useState({});
  const userCardRefs = useRef({});

  const maxPlayers = 10;
  const clientRef = useRef(null);

  // 방 정보 REST 로드
  const fetchRoomInfo = async () => {
    const res = await axios.get(`${API_BASE_URL}/lobby/${roomId}`);
    const data = res.data?.lobby ?? res.data;
    setRoomInfo(data);
  };

  useEffect(() => {
    if (!myNickname) {
      alert("닉네임 정보가 없습니다.");
      navigate("/");
      return;
    }
    fetchRoomInfo().catch(() => {});
    // eslint-disable-next-line
  }, [roomId]);

  useEffect(() => {
    if (!myNickname) return;
    if (clientRef.current?.active) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),

      onConnect: () => {
        console.log("✅ STOMP CONNECTED");

        client.subscribe(`/topic/lobby/${roomId}`, (message) => {
          const data = JSON.parse(message.body);

          if (data.type === "USER_UPDATE") {
            setPlayers(data.users);

            setIsHost(
              data.users.some(
                (u) => u.host === true && u.userId === userIdRef.current
              )
            );
          }

          if (data.type === "ROOM_UPDATED") {
            setRoomInfo((prev) => ({
              ...(prev || {}),
              id: data.roomId ?? prev?.id,
              name: data.roomName ?? prev?.name,
              mode: data.mode ?? prev?.mode,
            }));
          }

          if (data.type === "GAME_START") {
            navigate(`/gaming/${roomId}`);
          }

          if (data.type === "ROOM_DESTROYED") {
            alert("방이 삭제되었습니다.");
            navigate("/");
          }
        });

        /* =========================
           ✅ FLOAT CHAT BUBBLE SUBSCRIBE (추가)
        ========================= */
        client.subscribe("/topic/chat/bubble", (message) => {
          const data = JSON.parse(message.body);
          if (data.type !== "CHAT_BUBBLE") return;

          setChatBubbles((prev) => ({
            ...prev,
            [data.userId]: data.message,
          }));

          setTimeout(() => {
            setChatBubbles((prev) => {
              const copy = { ...prev };
              delete copy[data.userId];
              return copy;
            });
          }, 3000);
        });

        localStorage.setItem("userId", userIdRef.current);
        localStorage.setItem("nickname", myNickname);

        client.publish({
          destination: `/app/lobby/${roomId}/join`,
          body: JSON.stringify({
            roomId,
            userId: userIdRef.current,
            nickname: myNickname,
          }),
        });
      },
    });

    client.activate();
    clientRef.current = client;

    return () => client.deactivate();
  }, [roomId, myNickname, navigate]);

  const handleLeaveRoom = () => {
    if (clientRef.current?.connected) {
      clientRef.current.publish({
        destination: `/app/lobby/${roomId}/leave`,
        body: JSON.stringify({ userId: userIdRef.current }),
      });
    }
    navigate(-1);
  };

  const handleStartGame = () => {
    if (!isHost) return;
    if (!clientRef.current?.connected) return;

    clientRef.current.publish({
      destination: `/app/lobby/${roomId}/start`,
      body: JSON.stringify({ roomId }),
    });
  };

  const handleSendMessage = () => {
    if (!chatMessage.trim()) return;
    if (!clientRef.current?.connected) return;

    clientRef.current.publish({
      destination: `/app/chat/bubble`,
      body: JSON.stringify({
        lobbyId: roomId,
        userId: userIdRef.current,
        message: chatMessage,
      }),
    });

    setChatMessage("");
  };

  const slots = Array.from({ length: maxPlayers }, (_, i) => players[i] || null);
  const half = Math.ceil(maxPlayers / 2);
  const leftSlots = slots.slice(0, half);
  const rightSlots = slots.slice(half);

  const renderUserCard = (user, index) => (
    <div
      key={index}
      className={`user-card ${!user ? "empty" : ""}`}
      ref={(el) => {
        if (user && el) userCardRefs.current[user.userId] = el;
      }}
    >
      <div className="avatar" />
      <span className="username">
        {user ? user.nickname : "Empty"}
        {user?.host && <span style={{ color: "gold", marginLeft: 6 }}>★</span>}
      </span>
    </div>
  );

  const closeEditModal = async () => {
    setIsEditOpen(false);
    await fetchRoomInfo().catch(() => {});
  };

  return (
    <div className="lobby-wrapper">
      <button className="back-btn" onClick={handleLeaveRoom}>
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="play-area">
        <div className="play-grid">
          <div className="user-column left">{leftSlots.map(renderUserCard)}</div>

          <div className="lobby-center">
            <div className="logo-placeholder">LOGO</div>

            <div className="room-info-box">
              <h2>{roomInfo?.name ?? "로비"}</h2>
              <div className="room-detail">
                <span>모드: {roomInfo?.mode ?? "RANDOM"}</span>
                <span>•</span>
                <span>{players.length} / {maxPlayers} 명</span>
              </div>
            </div>

            {isHost ? (
              <div className="action-btn-group">
                <button className="start-btn" onClick={handleStartGame}>
                  GAME START
                </button>

                <button className="modify-btn" onClick={() => setIsEditOpen(true)}>
                  방 설정
                </button>
              </div>
            ) : (
              <div className="waiting-text">
                방장이 게임을 시작할 때까지<br />
                기다려 주세요!
              </div>
            )}
          </div>

          <div className="user-column right">{rightSlots.map(renderUserCard)}</div>
        </div>
      </div>

      <div className="chat-area">
        <input
          type="text"
          placeholder="메시지를 입력하세요..."
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
        />
        <button onClick={handleSendMessage}>전송</button>
      </div>

      {/* =========================
         ✅ FLOAT CHAT BUBBLES (추가)
      ========================= */}
      {Object.entries(chatBubbles).map(([uid, message]) => {
        const el = userCardRefs.current[uid];
        if (!el) return null;

        const rect = el.getBoundingClientRect();

        return (
          <div
            key={uid}
            className="chat-bubble-float"
            style={{
              position: "fixed",
              top: rect.top - 6,
              left: rect.right + 14,
              zIndex: 9999,
            }}
          >
            {message}
          </div>
        );
      })}

      {isEditOpen && isHost && roomInfo && (
        <CreateRoomModal
          mode="edit"
          roomData={roomInfo}
          onClose={closeEditModal}
        />
      )}
    </div>
  );
}

export default LobbyScreen;
