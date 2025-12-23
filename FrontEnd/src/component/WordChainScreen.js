import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";
import { API_BASE_URL } from "../api/config";
import "./LobbyScreen.css";
import "./GameScreen.css";

function WordChainScreen() {
  const { lobbyId: roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  /* =========================
     사용자 정보 (세션 기준)
  ========================= */
  const userId = useMemo(() => sessionStorage.getItem("userId") || "", []);
  const nickname = useMemo(
    () =>
      (location.state?.nickname ||
        sessionStorage.getItem("nickname") ||
        "").trim(),
    [location.state]
  );

  const clientRef = useRef(null);

  /* =========================
     상태
  ========================= */
  const maxPlayers = 10;

  const [connected, setConnected] = useState(false);

  // 로비 유저/방장 (슬롯용)
  const [players, setPlayers] = useState([]);
  const [hostUserId, setHostUserId] = useState("");

  // WordChain 상태
  const [started, setStarted] = useState(false);
  const [currentWord, setCurrentWord] = useState("");
  const [turnUserId, setTurnUserId] = useState("");
  const [lastMessage, setLastMessage] = useState("");

  // 입력/로그
  const [input, setInput] = useState("");
  const [log, setLog] = useState([]);

  const isMyTurn = String(turnUserId) === String(userId);

  // 라운드 및 타이머 관련 상태
  const [round, setRound] = useState(0);
  const [turnStartAt, setTurnStartAt] = useState(0);

  const [turnTimeLimit, setTurnTimeLimit] = useState(60);
  const [remainSeconds, setRemainSeconds] = useState(60);
  const [remainPercent, setRemainPercent] = useState(100);

  const [gameEnded, setGameEnded] = useState(false);
  const [endReason, setEndReason] = useState("");

  // 말풍선
  const [activeBubble, setActiveBubble] = useState(null);
  const bubbleHideTimerRef = useRef(null);

  const userCardRefs = useRef({});

  // 게임 시작 모달
  const [showStartModal, setShowStartModal] = useState(false);
  const [effectiveTurnStartAt, setEffectiveTurnStartAt] = useState(0);

  const startModalShownRef = useRef(false);

  const SEEN_START_KEY = `wordchain_seen_start_${roomId}`;

  // 스코어
  const [scoreByUserId, setScoreByUserId] = useState({});
  const [scoreEffect, setScoreEffect] = useState(null);

  // 우승자
  const [winners, setWinners] = useState([]);

  useEffect(() => {
    if (!started || !effectiveTurnStartAt) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - effectiveTurnStartAt;
      const limitMs = turnTimeLimit * 1000;

      const remainMs = Math.max(limitMs - elapsedMs, 0);

      const sec = Math.ceil(remainMs / 1000);
      const percent = Math.max((remainMs / limitMs) * 100, 0);

      setRemainSeconds(sec);
      setRemainPercent(percent);
    }, 100);

    return () => clearInterval(interval);
  }, [started, effectiveTurnStartAt, turnTimeLimit]);

  /* =========================
     WebSocket 연결
  ========================= */
  useEffect(() => {
    if (!roomId || !userId) return;
    if (!nickname) {
      alert("닉네임 정보가 없습니다.");
      navigate("/");
      return;
    }
    if (clientRef.current?.active) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_BASE_URL}/ws-stomp`),
      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: () => {},

      onConnect: () => {
        setConnected(true);

        client.publish({
          destination: `/app/lobby/${roomId}/join`,
          body: JSON.stringify({
            roomId,
            userId,
            nickname,
          }),
        });

        /* 1) 로비 유저 목록 구독 (좌/우 슬롯용) */
        client.subscribe(`/topic/lobby/${roomId}`, (msg) => {
          const data = JSON.parse(msg.body);

          if (data.type === "USER_UPDATE") {
            setPlayers(data.users || []);
            setHostUserId(data.hostUserId || "");
          }

          if (data.type === "ROOM_DESTROYED") {
            alert("방이 삭제되었습니다.");
            navigate("/");
          }
        });

        /* 2) WordChain 상태 구독 */
        client.subscribe(`/topic/wordchain/${roomId}`, (msg) => {
          const data = JSON.parse(msg.body);

          if (data.type === "WORD_CHAIN_END") {
            setGameEnded(true);
            setEndReason(data.reason);
            setWinners(data.winners || []);
            return;
          }


          if (data.type !== "WORD_CHAIN_STATE") return;

          const SEEN_START_KEY = `wordchain_seen_start_${roomId}`;
          const seenStartAt = sessionStorage.getItem(SEEN_START_KEY);

          if (
            data.started &&
            !startModalShownRef.current &&
            seenStartAt !== String(data.turnStartAt)
          ) {
            startModalShownRef.current = true;

            setShowStartModal(true);
            setRemainSeconds(data.turnTimeLimit ?? 60);
            setRemainPercent(100);

            sessionStorage.setItem(
              SEEN_START_KEY,
              String(data.turnStartAt)
            );

            // ⏱️ 모달 종료 후에만 타이머 시작
            setTimeout(() => {
              setShowStartModal(false);
              setEffectiveTurnStartAt(Date.now());
            }, 3000);
          }

          else if (data.lastAction === "ACCEPT") {
            setEffectiveTurnStartAt(data.turnStartAt);
          }

          else if (
            data.started &&
            seenStartAt === String(data.turnStartAt) &&
            !startModalShownRef.current
          ) {
            startModalShownRef.current = true;
            setEffectiveTurnStartAt(data.turnStartAt);
          }

          /* ===== 상태 업데이트 ===== */
          setStarted(Boolean(data.started));
          setCurrentWord(data.currentWord || "");
          setTurnUserId(data.turnUserId || "");
          setLastMessage(data.message || "");
          setRound(data.round ?? 0);
          setTurnTimeLimit(data.turnTimeLimit ?? 60);

          if(data.scoreByUserId) {
            setScoreByUserId(data.scoreByUserId);
          }

          if (data.lastAction === "ACCEPT") {
            const who =
              data.nickById?.[data.submitUserId] || data.submitUserId;
            const w = data.submitWord || "";
            if (w) {
              setLog((prev) => [
                { t: Date.now(), text: `${who}: ${w}` },
                ...prev,
              ]);
            }

            // ✅ 점수 이펙트 트리거
            setScoreEffect({
              userId: data.submitUserId,
              value: 10,
            });

            // ✅ 1초 후 제거
            setTimeout(() => {
              setScoreEffect(null);
            }, 2500);
          }
          /* if (data.lastAction === "REJECT") {
            const who =
              data.nickById?.[data.submitUserId] || data.submitUserId;
            const w = data.submitWord || "";
            if (w) {
              setLog((prev) => [
                { t: Date.now(), text: `실패 - ${who}: ${w}` },
                ...prev,
              ]);
            }
          } */
        });

        /* 3) ⭐ 핵심: 초기 USER_UPDATE 강제 요청 */
        client.publish({
          destination: `/app/lobby/${roomId}/sync`,
          body: JSON.stringify({}),
        });

        /* 4) WordChain 상태 동기화 */
        client.publish({
          destination: `/app/wordchain/${roomId}/sync`,
          body: JSON.stringify({}),
        });

        client.subscribe(`/topic/chat/bubble/${roomId}`, (msg) => {
          const data = JSON.parse(msg.body);
          if (data.type !== "CHAT_BUBBLE") return;

          if (bubbleHideTimerRef.current) {
            clearTimeout(bubbleHideTimerRef.current);
          }

          setActiveBubble({
            userId: data.userId,
            message: data.message,
          });

          bubbleHideTimerRef.current = setTimeout(() => {
            setActiveBubble(null);
          }, 3000);
        });
      },
    });

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
    };
  }, [roomId, userId, nickname, navigate]);

  /* =========================
     액션
  ========================= */
  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    if (!clientRef.current?.connected) return;

    // 내 차례면 게임 제출
    if (isMyTurn && started) {
      clientRef.current.publish({
        destination: `/app/wordchain/${roomId}/submit`,
        body: JSON.stringify({
          userId,
          nickname,
          word: text,
        }),
      });
    }
    // 내 차례 아니면 채팅만
    else {
      clientRef.current.publish({
        destination: `/app/wordchain/${roomId}/chat`,
        body: JSON.stringify({
          userId,
          message: text,
        }),
      });
    }

    setInput("");
  };

  const handleConfirmEnd = () => {
    setGameEnded(false);
    navigate("/join");
  };

  const handleLeaveRoom = () => {
    if (clientRef.current?.connected) {
      clientRef.current.publish({
        destination: `/app/lobby/${roomId}/leave`,
        body: JSON.stringify({ userId }),
      });
    }
    navigate("/");
  };

  /* =========================
     슬롯 배치 (로비와 동일)
  ========================= */
  const totalSlots = Array.from(
    { length: maxPlayers },
    (_, i) => players[i] || null
  );
  const leftSlots = totalSlots.filter((_, i) => i % 2 === 0);
  const rightSlots = totalSlots.filter((_, i) => i % 2 === 1);

  const renderUserCard = (user, index) => {
    if (!user) {
      return (
        <div key={index} className="user-card empty">
          <div className="avatar" />
          <span className="username">Empty</span>
        </div>
      );
    }

    const isMe = String(user.userId) === String(userId);
    const isTurn = String(user.userId) === String(turnUserId);

    return (
      <div
        key={user.userId}
        className={`user-card ${isMe ? "me" : ""}`}
        ref={(el) => {
          if (el) userCardRefs.current[user.userId] = el;
        }}
      >
        <div className="avatar" />

        <div className="user-info">
          <span className="username">
            {user.nickname}
            {isMe && <span className="me-mark">★</span>}
            {isTurn && <span className="turn-mark">(TURN)</span>}
          </span>

          {/* ✅ 여기 반드시 필요 */}
          <span className="user-score">
            Score: {user.score ?? 0}
          </span>
        </div>
      </div>
    );
  };

  /* =========================
     UI
  ========================= */
  return (
    <>
      {showStartModal && (
        <div className="answer-modal-overlay">
          <div className="answer-modal-content">
            <h2>끝말잇기 게임 시작!</h2>

            <div className="modal-info">
              <p>
                제시어에 맞게<br />
                <span className="highlight-text">끝말잇기</span>를 해보세요!
              </p>
            </div>
          </div>
        </div>
      )}
      {gameEnded && (
        <div className="answer-modal-overlay">
          <div className="answer-modal-content">
            <span className="confetti">🏆</span>

            <h2>게임 종료</h2>

            <div className="modal-info">
              <p style={{ fontSize: "1.1rem", marginBottom: 12 }}>
                ⏰ <strong>시간 초과</strong>로 게임이 종료되었습니다.
              </p>

              {winners.length > 0 && (
                <p style={{ fontSize: "1.2rem", fontWeight: "bold" }}>
                  우승자{" "}
                  <span className="highlight-text">
                    {winners.join(", ")}
                  </span>
                </p>
              )}
            </div>

            <button
              className="send-btn"
              style={{ marginTop: 20 }}
              onClick={handleConfirmEnd}
            >
              확인
            </button>
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

        {/* ===== 메인 플레이 영역 ===== */}
        <div className="play-area">
          <div className="play-grid">
            {/* 왼쪽 슬롯 */}
            <div className="user-column left">
              {leftSlots.map((u, i) => renderUserCard(u, i * 2))}
            </div>

            {/* 중앙 */}
            <div className="lobby-center">
              {started && (
                <div
                  style={{
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 18,
                  }}
                >
                  {/* 타이머 */}
                  {started && effectiveTurnStartAt > 0 && (
                    <div className="timer-container" style={{ width: 520 }}>
                      <div className="timer-seconds">{remainSeconds}</div>
                      <div
                        className="timer-bar"
                        style={{
                          width: `${(remainSeconds / turnTimeLimit) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                  {/* 제시어 */}
                  <div
                    style={{
                      padding: "18px 40px",
                      border: "4px solid #2c2c2c",
                      borderRadius: 18,
                      background: "#2f7d3a",
                      color: "#fff",
                      fontSize: 28,
                      fontWeight: 900,
                      textAlign: "center",
                      boxShadow: "6px 6px 0 rgba(0,0,0,0.25)",
                    }}
                  >
                    {currentWord || "제시어 없음"}
                  </div>
                </div>
              )}

              <div className="room-info-box">
                <h2>끝말잇기 진행</h2>
                <div className="room-detail">
                  {started
                    ? isMyTurn
                      ? "내 턴"
                      : "상대 턴"
                    : "게임 시작 대기 중"}
                </div>
                {lastMessage && (
                  <div style={{ marginTop: 8 }}>{lastMessage}</div>
                )}
              </div>

              <div className="room-info-box" style={{ marginTop: 14 }}>
                <h2>로그</h2>
                <div
                  style={{
                    height: 140,
                    overflowY: "auto",
                    background: "rgba(255,255,255,0.35)",
                    borderRadius: 12,
                    padding: 10,
                  }}
                >
                  {log.length === 0
                    ? "아직 기록이 없습니다."
                    : log.map((l) => <div key={l.t}>{l.text}</div>)}
                </div>
              </div>
            </div>

            {/* 오른쪽 슬롯 */}
            <div className="user-column right">
              {rightSlots.map((u, i) => renderUserCard(u, i * 2 + 1))}
            </div>
          </div>
        </div>

        {/* ===== 하단 입력 ===== */}
        {started && (
          <div className="chat-area">
            <input
              type="text"
              placeholder={
                isMyTurn ? "단어를 입력하세요..." : "채팅을 입력하세요..."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button onClick={handleSend}>전송</button>
          </div>
        )}
        {activeBubble && (() => {
          const el = userCardRefs.current[activeBubble.userId];
          if (!el) return null;

          const rect = el.getBoundingClientRect();

          return (
            <div
              className="chat-bubble-float"
              style={{
                position: "fixed",
                top: rect.top + rect.height / 2,
                left: rect.right + 12,
                transform: "translateY(-50%)",
                zIndex: 9999,
                maxWidth: "220px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                pointerEvents: "none",
              }}
            >
              {activeBubble.message}
            </div>
          );
        })()}
      </div>
    </>
  );
}

export default WordChainScreen;
