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
import EditProfileModal from "./profilemodal/editProfileModal";

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
  const initialModeFromState = location.state?.mode;

  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [chatMessage, setChatMessage] = useState("");

  const [roomInfo, setRoomInfo] = useState(null);
  const roomInfoRef = useRef(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const [gameStarted, setGameStarted] = useState(false);

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
    const rawData = res.data?.lobby ?? res.data;
    const data = {
      ...rawData,
      mode: normalizeMode(rawData?.mode || initialModeFromState),
    };
    setRoomInfo(data);
    roomInfoRef.current = data;
    if (typeof data.gameStarted === "boolean") {
      setGameStarted(data.gameStarted);
    }

    if(data.gameStarted) {
      if(normalizeMode(data.mode) === "WORD_CHAIN") {
        navigate(`/wordchain/${roomId}`, {
          state : { nickname : myNickname },
          replace : true,
        });
      } else {
        navigate(`/gaming/${roomId}`, {
          state : { nickname : myNickname },
          replace : true,
        });
      }
    }
  };

  // ============================================================
  // [수정됨] 닉네임 및 프로필 이미지 변경 확정 처리
  // EditProfileModal에서 (닉네임, 이미지인덱스) 두 개의 인자를 넘겨줍니다.
  // ============================================================
  const handleConfirmProfile = (updatedNickname, updatedProfileImage) => {
    console.log("[profile] confirm clicked", {
      connected: clientRef.current?.connected,
      updatedNickname,
      updatedProfileImage,
      type: typeof updatedProfileImage,
    });

    if (!clientRef.current?.connected) return;

    // 서버로 변경 요청 전송
    clientRef.current.publish({
      // ★ 주의: 백엔드 컨트롤lobby러의 @MessageMapping 주소와 일치해야 합니다.
      // 닉네임과 프로필을 같이 처리하는 엔드포인트(예: /profile)를 사용한다고 가정했습니다.
      destination: `/app/lobby/${roomId}/profile`,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: userIdRef.current,
        nickname: updatedNickname,
        profileImage: Number(updatedProfileImage), // ★ 선택된 이미지 번호 추가
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
    WORD_CHAIN: "끝말잇기",
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

            if (data.hostUserId) {
              setIsHost(
                String(data.hostUserId) === String(userIdRef.current)
              );
            }
            if (data.gameStarted) {
              const mode = normalizeMode(data.mode || roomInfoRef.current?.mode || initialModeFromState);

              navigate(
                mode === "WORD_CHAIN"
                  ? `/wordchain/${roomId}`
                  : `/gaming/${roomId}`,
                { replace: true }
              );
            }
          }

          if (data.type === "ROOM_UPDATED") {
            const newData = {
              ...(roomInfoRef.current || {}),
              id: data.roomId ?? roomInfoRef.current?.id,
              name: data.roomName ?? roomInfoRef.current?.name,
              mode: normalizeMode(data.mode ?? roomInfoRef.current?.mode ?? initialModeFromState),
              gameStarted: data.gameStarted ?? roomInfoRef.current?.gameStarted,
            };

            setRoomInfo(newData);
            roomInfoRef.current = newData;

            if (typeof newData.gameStarted === "boolean") {
              setGameStarted(newData.gameStarted);
            }

            if (data.gameStarted) {
              const mode = normalizeMode(data.mode || roomInfoRef.current?.mode || initialModeFromState);

              navigate(
                mode === "WORD_CHAIN"
                  ? `/wordchain/${roomId}`
                  : `/gaming/${roomId}`,
                { replace: true }
              );
            }
          }

          if (data.type === "GAME_START") {
            const currentMode = normalizeMode(data.mode || roomInfoRef.current?.mode || initialModeFromState);
            if (currentMode === "WORD_CHAIN") {
              navigate(`/wordchain/${roomId}`, { 
                state: { nickname: myNickname } 
              });
            } else {
              navigate(`/gaming/${roomId}`, {
                 state: { nickname: myNickname } 
              });
            }
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

        client.subscribe(`/topic/wordchain/${roomId}`, (message) => {
          const data = JSON.parse(message.body);
          if (data.type === "START_DENIED") {
            setModal({
              title: "게임 시작 불가",
              message: "끝말잇기 게임을 시작할 수 없습니다. 잠시 후 다시 시도해주세요.",
            });
          }
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

        client.publish({
          destination: `/app/lobby/${roomId}/sync`,
          body: JSON.stringify({}),
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
  }, [roomId, myNickname, navigate, initialModeFromState]);

  const handleLeaveRoom = () => {
    if (clientRef.current?.connected) {
      clientRef.current.publish({
        destination: `/app/lobby/${roomId}/leave`,
        body: JSON.stringify({ userId: userIdRef.current }),
      });
    }
    navigate(-1);
  };

  const normalizeMode = (mode) => {
    if (!mode) return "RANDOM";
    const raw = String(mode).trim();
    const upper = raw.toUpperCase();
    if (upper === "WORDCHAIN" || raw === "끝말잇기") return "WORD_CHAIN";
    return upper;
  };

  const openEditModal = async () => {
    if (!isHost) return;
    if (!roomInfoRef.current) {
      try {
        await fetchRoomInfo();
      } catch (_) {
        setModal({
          title: "방 설정 불가",
          message: "방 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
        });
        return;
      }
    }
    setIsEditOpen(true);
  };

  const handleStartGame = () => {
    if (!isHost) return;
    if (!clientRef.current?.connected) {
      setModal({
        title: "연결 오류",
        message: "서버 연결이 끊어졌습니다. 잠시 후 다시 시도해주세요.",
      });
      return;
    }

    const currentMode = normalizeMode(roomInfo?.mode || roomInfoRef.current?.mode);

    if (currentMode === "WORD_CHAIN") {
      clientRef.current.publish({
        destination: `/app/wordchain/${roomId}/start`,
        body: JSON.stringify({}),
      });
      return;
    }

    // 2. 0.2초 딜레이 후 로비 상태 변경 (화면 이동 트리거)
    // 이 딜레이가 있어야 소켓 끊기기 전에 서버가 시작 처리를 완료함
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

  // ============================================================
  // 유저 슬롯 배치 로직 (좌->우->좌->우)
  // ============================================================

  // 1. 전체 슬롯 생성 (최대 10명)
  const totalSlots = Array.from({ length: maxPlayers }, (_, i) => players[i] || null);

  // 2. 왼쪽 컬럼: 짝수 인덱스
  const leftSlots = totalSlots.filter((_, i) => i % 2 === 0);

  // 3. 오른쪽 컬럼: 홀수 인덱스
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
            {/* 왼쪽 컬럼 (짝수번째 유저들) */}
            <div className="user-column left">
              {leftSlots.map((u, i) => renderUserCard(u, i * 2))}
            </div>

            <div className="lobby-center">
              <img src="/img/logo.png" className="logo-placeholder"/>

              <div className="room-info-box">
                <h2>{roomInfo?.name ?? "로비"}</h2>
                <div className="room-detail">
                  <span>
                    모드: {MODE_LABEL[normalizeMode(roomInfo?.mode || initialModeFromState)] ?? normalizeMode(roomInfo?.mode || initialModeFromState)}
                  </span>
                  <span>•</span>
                  <span>
                    {players.length} / {maxPlayers} 명
                  </span>
                </div>
              </div>

              {isHost ? !gameStarted &&(
                <div className="action-btn-group">
                  <button className="start-btn" onClick={handleStartGame}>
                    GAME START
                  </button>

                  <button className="modify-btn" onClick={openEditModal}>
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

            {/* 오른쪽 컬럼 (홀수번째 유저들) */}
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

        {/* 말풍선 렌더링: 오른쪽 컬럼이면 카드 왼쪽에 띄움 */}
        {Object.entries(chatBubbles).map(([uid, message]) => {
          const el = userCardRefs.current[uid];
          if (!el) return null;

          const rect = el.getBoundingClientRect();
          const isRightSide = rect.left > window.innerWidth / 2;

          return (
            <div
              key={uid}
              // 화자가 오른쪽이면 mirror 클래스 추가
              className={`chat-bubble-float ${isRightSide ? "mirror" : ""}`}
              style={{
                position: "fixed",
                // ✅ [수정 1] 기준점을 카드의 수직 정중앙으로 변경
                top: rect.top + rect.height / 2,
                
                left: isRightSide ? rect.left - 14 : rect.right + 14,
                
                // ✅ [수정 2] transform에 Y축 -50%를 추가하여 말풍선이 정확히 중앙에 오도록 조정
                transform: isRightSide 
                  ? "translate(-100%, -50%)"   // 오른쪽: X축(왼쪽으로) 이동 + Y축(위로) 이동
                  : "translateY(-50%)",        // 왼쪽: Y축(위로) 이동
                  
                zIndex: 9999,
              }}
            >
              {message}
            </div>
          );
        })}

        {isEditOpen && isHost && (
          <CreateRoomModal
            mode="edit"
            roomData={{
              id: roomId,
              name: roomInfoRef.current?.name ?? roomInfo?.name ?? "",
              mode: normalizeMode(roomInfoRef.current?.mode ?? roomInfo?.mode ?? "RANDOM"),
              password: roomInfoRef.current?.password ?? roomInfo?.password ?? null,
            }}
            onClose={closeEditModal}
          />
        )}
      </div>
    </>
  );
}

export default LobbyScreen;
