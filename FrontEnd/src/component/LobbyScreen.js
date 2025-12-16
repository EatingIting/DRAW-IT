import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { nanoid } from "nanoid";
import axios from "axios";

import "./LobbyScreen.css";
import { API_BASE_URL } from "../api/config";
import CreateRoomModal from "./CreateRoomModal";

function LobbyScreen() {
  const navigate = useNavigate();
  const { lobbyId: roomId } = useParams();
  const location = useLocation();

  // 1. 유저 ID 및 닉네임 설정
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

  // 2. State 정의
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [roomInfo, setRoomInfo] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // ✅ [수정] 소켓 콜백 내에서 최신 상태를 참조하기 위한 Ref
  const playersRef = useRef([]);

  const maxPlayers = 10;
  const clientRef = useRef(null);

  // 3. 방 정보 1회 로드
  const fetchRoomInfo = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/lobby/${roomId}`);
      const data = res.data?.lobby ?? res.data;
      setRoomInfo(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!myNickname) {
      alert("닉네임 정보가 없습니다.");
      navigate("/");
      return;
    }
    fetchRoomInfo();
  }, [roomId, myNickname, navigate]);

  // 4. 소켓 연결 및 구독
  useEffect(() => {
    if (!myNickname) return;
    if (clientRef.current?.active) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),
      reconnectDelay: 5000,

      onConnect: () => {
        console.log("✅ STOMP CONNECTED (Lobby)");

        // 구독: /topic/lobby/{roomId} (Controller와 일치)
        client.subscribe(`/topic/lobby/${roomId}`, (message) => {
          const data = JSON.parse(message.body);

          // (1) 유저 업데이트 (입장/퇴장)
          if (data.type === "USER_UPDATE") {
            setPlayers(data.users);
            playersRef.current = data.users; // ✅ Ref 동기화

            // 내가 방장인지 확인
            const amIHost = data.users.some(
              (u) => u.host === true && u.userId === userIdRef.current
            );
            setIsHost(amIHost);
          }

          // (2) 방 설정 변경
          if (data.type === "ROOM_UPDATED") {
            setRoomInfo((prev) => ({
              ...(prev || {}),
              id: data.roomId ?? prev?.id,
              name: data.roomName ?? prev?.name,
              mode: data.mode ?? prev?.mode,
            }));
          }

          // (3) 게임 시작
          if (data.type === "GAME_START") {
            // ✅ [수정] 화면 전환 시 현재 플레이어 리스트(Ref)를 함께 전달
            navigate(`/gaming/${roomId}`, {
              state: { players: playersRef.current },
            });
          }

          // (4) 방 삭제
          if (data.type === "ROOM_DESTROYED") {
            alert("방이 삭제되었습니다.");
            navigate("/");
          }
        });

        // (5) 채팅 구독 (별도 로직이 있다면 추가)
        client.subscribe(`/topic/lobby/${roomId}/chat`, () => {});

        localStorage.setItem("userId", userIdRef.current);
        localStorage.setItem("nickname", myNickname);

        // 입장 메시지 전송
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

    return () => {
      client.deactivate();
    };
  }, [roomId, myNickname, navigate]);

  // 5. 핸들러 함수들
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
      destination: `/app/lobby/${roomId}/chat`,
      body: JSON.stringify({
        roomId,
        userId: userIdRef.current,
        nickname: myNickname,
        content: chatMessage,
      }),
    });
    setChatMessage("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSendMessage();
  };

  const closeEditModal = async () => {
    setIsEditOpen(false);
    await fetchRoomInfo();
  };

  // 6. UI 렌더링 준비
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
          <div className="user-column left">{leftSlots.map(renderUserCard)}</div>

          <div className="lobby-center">
            <div className="logo-placeholder">LOGO</div>

            <div className="room-info-box">
              <h2>{roomInfo?.name ?? "로비"}</h2>
              <div className="room-detail">
                <span>모드: {roomInfo?.mode ?? "RANDOM"}</span>
                <span>•</span>
                <span>
                  {players.length} / {maxPlayers} 명
                </span>
              </div>
            </div>

            {isHost ? (
              <div className="action-btn-group">
                <button className="start-btn" onClick={handleStartGame}>
                  GAME START
                </button>
                <button
                  className="modify-btn"
                  onClick={() => setIsEditOpen(true)}
                >
                  방 설정
                </button>
              </div>
            ) : (
              <div className="waiting-text">
                방장이 게임을 시작할 때까지
                <br />
                기다려 주세요!
              </div>
            )}
          </div>

          <div className="user-column right">{rightSlots.map(renderUserCard)}</div>
        </div>
      </div>

      <div className="chat-area">
        <div className="chat-input-wrapper">
          <input
            type="text"
            placeholder="메시지를 입력하세요..."
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendMessage();
            }}
          />
          <button className="send-btn" onClick={handleSendMessage}>
            전송
          </button>
        </div>
      </div>

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