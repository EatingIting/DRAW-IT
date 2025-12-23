import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { nanoid } from "nanoid";
import "./LobbyScreen.css";
import { API_BASE_URL } from "../api/config";
import axios from "axios";
import CreateRoomModal from "./CreateRoomModal";
// 새로 만든 모달 컴포넌트 import (경로 주의)
import EditProfileModal from "./profilemodal/EditProfileModal"; // 경로가 맞는지 확인해주세요

// 프로필 이미지 경로 헬퍼 함수
const getProfileImgPath = (profileValue) => {
  // 값이 없거나 "default" 문자열이면 default.jpg 반환
  if (!profileValue || profileValue === "default") {
    return "/img/profile/default.jpg";
  }
  // 그 외(숫자 1~10)면 해당 번호 이미지 반환
  return `/img/profile/profile${profileValue}.jpg`;
};

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

  /* Chat Bubble */
  const [chatBubbles, setChatBubbles] = useState({});
  const userCardRefs = useRef({});

  const maxPlayers = 10;
  const clientRef = useRef(null);

  // uid -> timeoutId
  const bubbleTimeoutRef = useRef({});

  const [modal, setModal] = useState(null);

  // 닉네임 모달 표시 여부
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);

  // 내 정보 찾기
  const myPlayerInfo = players.find(p => p.userId === userIdRef.current);
  
  // 내 정보가 players에 있으면 그 닉네임을 쓰고, 없으면 초기값(myNickname)을 씁니다.
  const currentDisplayNickname = myPlayerInfo ? myPlayerInfo.nickname : myNickname;

  // 프로필 이미지가 없으면 default
  const currentProfileIndex = myPlayerInfo?.profileImage || "default";

  // 사용 중인 프로필 이미지 찾기 (default는 제외)
  const usedProfileIndexes = players
    .map(p => p.profileImage)
    .filter(img => img && img !== "default");

  // 방 정보 REST 로드
  const fetchRoomInfo = async () => {
    const res = await axios.get(`${API_BASE_URL}/lobby/${roomId}`);
    const data = res.data?.lobby ?? res.data;
    setRoomInfo(data);
  };

  // ============================================================
  // [수정됨] 닉네임 및 프로필 이미지 변경 확정 처리
  // EditProfileModal에서 (닉네임, 이미지인덱스) 두 개의 인자를 넘겨줍니다.
  // ============================================================
  const handleConfirmProfile = (updatedNickname, updatedProfileImage) => {
    if (!clientRef.current?.connected) return;

    // 서버로 변경 요청 전송
    clientRef.current.publish({
      // ★ 주의: 백엔드 컨트롤lobby러의 @MessageMapping 주소와 일치해야 합니다.
      // 닉네임과 프로필을 같이 처리하는 엔드포인트(예: /profile)를 사용한다고 가정했습니다.
      destination: `/app/lobby/${roomId}/profile`, 
      body: JSON.stringify({
        userId: userIdRef.current,
        nickname: updatedNickname,
        profileImage: updatedProfileImage, // ★ 선택된 이미지 번호 추가
      }),
    });

    // 로컬 스토리지 업데이트 (새로고침 대비)
    sessionStorage.setItem("nickname", updatedNickname);
    // 필요하다면 프로필 이미지도 저장 가능: sessionStorage.setItem("profileImage", updatedProfileImage);

    setIsNicknameModalOpen(false);
  };

  const MODE_LABEL = {
    POKEMON: "포켓몬",
    ANIMAL: "동물",
    JOB: "직업",
    FOOD: "음식",
    OBJECT: "사물",
    SPORT: "스포츠",
    RANDOM: "랜덤",
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
        console.log("STOMP CONNECTED");

        client.subscribe(`/topic/lobby/${roomId}`, (message) => {
          const data = JSON.parse(message.body);

          if (data.type === "USER_UPDATE") {
            const serverSortedUsers = data.users || [];
            setPlayers(serverSortedUsers);
            setIsHost(data.hostUserId === userIdRef.current);
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

          if (data.type === "GAME_START_DENIED") {
            if (data.reason === "NOT_ENOUGH_PLAYERS") {
              setModal({
                title: "게임 시작 불가",
                message: "최소 인원(2명) 이상이 되어야 게임을 시작할 수 있습니다.",
              });
            }
          }
        });

        client.subscribe("/topic/chat/bubble", (message) => {
          const data = JSON.parse(message.body);
          if (data.type !== "CHAT_BUBBLE") return;

          const uid = data.userId;

          const prevTimeout = bubbleTimeoutRef.current[uid];
          if (prevTimeout) clearTimeout(prevTimeout);

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

        localStorage.setItem("userId", userIdRef.current);
        localStorage.setItem("nickname", myNickname);

        // 입장 시에도 기본 정보 전송 (필요 시 profileImage 추가 가능)
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
      Object.values(bubbleTimeoutRef.current).forEach((t) => clearTimeout(t));
      bubbleTimeoutRef.current = {};
      client.deactivate();
    };
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

  const handleUserCardClick = (user) => {
    if (!user) return;
    if (user.userId !== userIdRef.current) return;
    setIsNicknameModalOpen(true);
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

  // 슬롯 배치 로직
  const totalSlots = Array.from({ length: maxPlayers }, (_, i) => players[i] || null);
  const leftSlots = totalSlots.filter((_, i) => i % 2 === 0);
  const rightSlots = totalSlots.filter((_, i) => i % 2 === 1);

  const renderUserCard = (user, index) => {
    const isMe = user?.userId === userIdRef.current;
    const profileValue = user?.profileImage || "default";

    return (
      <div
        key={index}
        className={`user-card ${!user ? "empty" : ""} ${isMe ? "me" : ""}`}
        onClick={() => handleUserCardClick(user)}
        style={{ cursor: isMe ? "pointer" : "default" }}
        ref={(el) => {
          if (user && el) userCardRefs.current[user.userId] = el;
        }}
      >
        {user?.host && <span className="host-badge">★</span>}
        <div className="avatar">
          {user && (
            <img 
              src={getProfileImgPath(profileValue)}
              alt="avatar"
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
            />
          )}
        </div>
        <span className="username">{user ? user.nickname : "Empty"}</span>
      </div>
    );
  };

  const closeEditModal = async () => {
    setIsEditOpen(false);
    await fetchRoomInfo().catch(() => {});
  };

  return (
    <>
      {/* [수정됨] onConfirm에 handleConfirmProfile 연결 */}
      <EditProfileModal
        isOpen={isNicknameModalOpen}
        onClose={() => setIsNicknameModalOpen(false)}
        currentNickname={currentDisplayNickname}
        currentProfileIndex={currentProfileIndex}
        usedProfileIndexes={usedProfileIndexes}
        onConfirm={handleConfirmProfile} 
      />

      {modal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{modal.title}</h2>
            <p>{modal.message}</p>
            <button onClick={() => setModal(null)}>확인</button>
          </div>
        </div>
      )}

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
            <div className="user-column left">
              {leftSlots.map((u, i) => renderUserCard(u, i * 2))}
            </div>

            <div className="lobby-center">
              <div className="logo-placeholder">LOGO</div>

              <div className="room-info-box">
                <h2>{roomInfo?.name ?? "로비"}</h2>
                <div className="room-detail">
                  <span>
                    모드: {MODE_LABEL[roomInfo?.mode] ?? roomInfo?.mode}
                  </span>
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

                  <button className="modify-btn" onClick={() => setIsEditOpen(true)}>
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

            <div className="user-column right">
              {rightSlots.map((u, i) => renderUserCard(u, i * 2 + 1))}
            </div>
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

        {Object.entries(chatBubbles).map(([uid, message]) => {
          const el = userCardRefs.current[uid];
          if (!el) return null;

          const rect = el.getBoundingClientRect();
          const isRightSide = rect.left > window.innerWidth / 2;

          return (
            <div
              key={uid}
              className="chat-bubble-float"
              style={{
                position: "fixed",
                top: rect.top - 6,
                left: isRightSide ? rect.left - 14 : rect.right + 14,
                transform: isRightSide ? "translateX(-100%)" : "none",
                zIndex: 9999,
              }}
            >
              {message}
            </div>
          );
        })}

        {isEditOpen && isHost && roomInfo && (
          <CreateRoomModal mode="edit" roomData={roomInfo} onClose={closeEditModal} />
        )}
      </div>
    </>
  );
}

export default LobbyScreen;