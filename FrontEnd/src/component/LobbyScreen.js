import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { nanoid } from "nanoid";
import "./LobbyScreen.css";
import { API_BASE_URL } from "../api/config"; // ✅ 위에서 수정한 IP 주소 파일
import axios from "axios";
import CreateRoomModal from "./CreateRoomModal";

function LobbyScreen() {
  const navigate = useNavigate();
  const { lobbyId: roomId } = useParams();
  const location = useLocation();
  const myPassword = location.state?.password || null;

  // 1. 유저 ID 관리 (세션 스토리지에 확실히 저장)
  const userIdRef = useRef(
    sessionStorage.getItem("userId") || nanoid(12)
  );

  // 2. 닉네임 관리 (없으면 강제 퇴장)
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

  // 말풍선 상태
  const [chatBubbles, setChatBubbles] = useState({});
  const userCardRefs = useRef({});
  const bubbleTimeoutRef = useRef({});

  const maxPlayers = 10;
  const clientRef = useRef(null);

  // 3. 방 정보 가져오기 (HTTP)
  const fetchRoomInfo = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/lobby/${roomId}`);
      // 백엔드 응답 구조에 따라 유연하게 처리
      const data = res.data?.lobby ?? res.data; 
      setRoomInfo(data);

      if (data.users) {
         setPlayers(data.users);
         
         // 내가 방장인지 체크
         const amIHost = data.users.some(
             (u) => u.userId === userIdRef.current && u.host === true
         );
         setIsHost(amIHost);
      }
    } catch (err) {
      console.error("방 정보 로드 실패:", err);
      alert("존재하지 않는 방이거나 연결할 수 없습니다.");
      navigate("/");
    }
  };

  useEffect(() => {
    // 닉네임 없으면 쫓아내기
    if (!myNickname) {
      alert("닉네임 정보가 없습니다. 메인으로 이동합니다.");
      navigate("/");
      return;
    }

    // ID 저장 (새로고침 대비)
    sessionStorage.setItem("userId", userIdRef.current);
    sessionStorage.setItem("nickname", myNickname);

    fetchRoomInfo();
    connectSocket();

    // 청소(Cleanup)
    return () => disconnectSocket();
    // eslint-disable-next-line
  }, [roomId, myNickname]);

  // 4. 소켓 연결 함수
  const connectSocket = () => {
    if (clientRef.current?.active) return;

    const client = new Client({
      // SockJS 연결 (Config의 IP주소 사용됨)
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),
      reconnectDelay: 5000,
      
      onConnect: () => {
        console.log("✅ Lobby 소켓 연결 성공!");

        // (A) 로비 구독 (유저 업데이트, 게임 시작 등)
        client.subscribe(`/topic/lobby/${roomId}`, (message) => {
          const data = JSON.parse(message.body);

          switch (data.type) {
            case "USER_UPDATE":
              setPlayers(data.users); // 유저 리스트 갱신
              
              // 내가 방장인지 확인 (백엔드 user.host 값 활용)
              const amIHost = data.users.some(
                (u) => u.userId === userIdRef.current && u.host === true
              );
              setIsHost(amIHost);
              break;

            case "ROOM_UPDATED":
              setRoomInfo((prev) => ({
                ...(prev || {}),
                id: data.roomId,
                name: data.roomName,
                mode: data.mode,
              }));
              fetchRoomInfo(); // 확실하게 HTTP로 한 번 더 갱신
              break;

            case "GAME_START":
              navigate(`/gaming/${roomId}`);
              break;

            case "ROOM_DESTROYED":
              alert("방이 삭제되었습니다.");
              navigate("/");
              break;

            default:
              break;
          }
        });

        // (B) 채팅 말풍선 구독
        client.subscribe("/topic/chat/bubble", (message) => {
          const data = JSON.parse(message.body);
          if (data.type !== "CHAT_BUBBLE") return;

          const uid = data.userId;
          
          // 말풍선 표시
          setChatBubbles((prev) => ({ ...prev, [uid]: data.message }));

          // 기존 타이머 취소 후 재설정 (3초 뒤 사라짐)
          if (bubbleTimeoutRef.current[uid]) {
            clearTimeout(bubbleTimeoutRef.current[uid]);
          }
          bubbleTimeoutRef.current[uid] = setTimeout(() => {
            setChatBubbles((prev) => {
              const copy = { ...prev };
              delete copy[uid];
              return copy;
            });
          }, 3000);
        });

        // (C) 입장 메시지 전송 (이게 있어야 백엔드가 알음!)
        client.publish({
          destination: `/app/lobby/${roomId}/join`,
          body: JSON.stringify({
            roomId,
            userId: userIdRef.current,
            nickname: myNickname,
            password: myPassword
          }),
        });
      },

      onStompError: (frame) => {
        console.error("❌ 소켓 에러:", frame.headers["message"]);
      },
    });

    client.activate();
    clientRef.current = client;
  };

  const disconnectSocket = () => {
    if (clientRef.current?.connected) {
      // 퇴장 메시지 전송
      clientRef.current.publish({
        destination: `/app/lobby/${roomId}/leave`,
        body: JSON.stringify({ userId: userIdRef.current }),
      });
      clientRef.current.deactivate();
    }
  };

  // 게임 시작
  const handleStartGame = () => {
    if (!isHost) return;
    clientRef.current?.publish({
      destination: `/app/lobby/${roomId}/start`,
      body: JSON.stringify({ roomId }),
    });
  };

  // 채팅 보내기
  const handleSendMessage = () => {
    if (!chatMessage.trim() || !clientRef.current?.connected) return;

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

  // 유저 카드 렌더링
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

  return (
    <div className="lobby-wrapper">
      <button className="back-btn" onClick={() => {
        handleLeaveRoom(); // 퇴장 처리
        navigate("/");
      }}>
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
              <h2>{roomInfo?.name ?? "로딩 중..."}</h2>
              <div className="room-detail">
                <span>모드: {roomInfo?.mode ?? "RANDOM"}</span>
                <span>•</span>
                <span>{players.length} / {maxPlayers} 명</span>
              </div>
            </div>

            {isHost ? (
              <div className="action-btn-group">
                <button className="start-btn" onClick={handleStartGame}>GAME START</button>
                <button className="modify-btn" onClick={() => setIsEditOpen(true)}>방 설정</button>
              </div>
            ) : (
              <div className="waiting-text">
                방장이 게임을 시작할 때까지<br />기다려 주세요!
              </div>
            )}
          </div>

          <div className="user-column right">{rightSlots.map(renderUserCard)}</div>
        </div>
      </div>

      <div className="chat-area">
        <input
          type="text"
          placeholder="메시지 입력..."
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
        />
        <button onClick={handleSendMessage}>전송</button>
      </div>

      {/* 말풍선 렌더링 */}
      {Object.entries(chatBubbles).map(([uid, message]) => {
        const el = userCardRefs.current[uid];
        if (!el) return null;

        const userIndex = players.findIndex(p => p.userId === uid);
        const isLeftColumn = userIndex === -1 ? true : userIndex < 5;

        const rect = el.getBoundingClientRect();

        return (
          <div
            key={uid}
            // 왼쪽이면 left-col, 오른쪽이면 right-col 클래스 붙임
            className={`chat-bubble-float ${isLeftColumn ? "left-col" : "right-col"}`}
            style={{
              position: "fixed",
              top: rect.top + rect.height / 2, // 카드 높이의 절반(중앙)
              
              // 🔥 [핵심] 왼쪽 줄은 카드 오른쪽 끝, 오른쪽 줄은 카드 왼쪽 끝에 붙임
              left: isLeftColumn ? rect.right + 15 : rect.left - 15,
              
              // 🔥 [핵심] 오른쪽 줄은 말풍선을 왼쪽으로 100% 밀어서 배치
              transform: isLeftColumn ? "translateY(-50%)" : "translate(-100%, -50%)",
              
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
          onClose={() => {
            setIsEditOpen(false);
            fetchRoomInfo();
          }}
        />
      )}
    </div>
  );
  
  function handleLeaveRoom() {
      disconnectSocket();
  }
}

export default LobbyScreen;