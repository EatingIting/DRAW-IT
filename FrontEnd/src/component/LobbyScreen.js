import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Client } from '@stomp/stompjs'; // [변경] 최신 라이브러리 import
import SockJS from 'sockjs-client';      // 백엔드 호환용
import "./LobbyScreen.css";

function LobbyScreen() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const location = useLocation();

  const myNickname = location.state?.nickname || sessionStorage.getItem('nickname');

  const [players, setPlayers] = useState([]);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]); // (필요 시 사용)
  const [isHost, setIsHost] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(10);

  // STOMP Client 객체 저장
  const clientRef = useRef(null);

  useEffect(() => {
    if (!myNickname) {
      alert("닉네임 정보가 없습니다.");
      navigate("/");
      return;
    }

    // 1. Client 객체 생성 및 설정
    const client = new Client({
      // 백엔드가 SockJS를 쓰므로 webSocketFactory 사용
      webSocketFactory: () => new SockJS('http://localhost:8080/ws-stomp'),
      
      // 디버그 로그 (개발 중에만 켜두세요)
      debug: function (str) {
        console.log(str);
      },

      // 2. 연결 성공 시 실행될 콜백
      onConnect: () => {
        console.log(">>> STOMP 연결 성공!");

        // A. 구독 설정 (Subscribe)
        
        // (1) 방 정보/유저 리스트 구독
        client.subscribe(`/topic/lobby/${roomId}`, (message) => {
          const data = JSON.parse(message.body);

          if (data.type === 'USER_UPDATE') {
            setPlayers(data.users);
            
            // 방장 여부 확인
            const me = data.users.find(u => u.nickname === myNickname);
            if (me && me.isHost) setIsHost(true);
          } 
          else if (data.type === 'GAME_START') {
            navigate(`/game/${roomId}`);
          }
        });

        // (2) 채팅 구독
        client.subscribe(`/topic/lobby/${roomId}/chat`, (message) => {
          const chatData = JSON.parse(message.body);
          // 채팅 로그 확인용
          console.log("채팅 수신:", chatData); 
          // setChatHistory(prev => [...prev, chatData]); 
        });

        // B. 입장 메시지 전송 (Publish)
        // 주의: send 대신 publish 사용, 객체 파라미터 전달
        client.publish({
          destination: `/app/lobby/${roomId}/join`,
          body: JSON.stringify({
            nickname: myNickname,
            roomId: roomId
          }),
        });
      },

      // 연결 끊김/에러 처리
      onStompError: (frame) => {
        console.error('Broker reported error: ' + frame.headers['message']);
        console.error('Additional details: ' + frame.body);
      },
    });

    // 3. 소켓 활성화 (연결 시작)
    client.activate();
    clientRef.current = client;

    // 4. 언마운트 시 연결 해제
    return () => {
      if (clientRef.current) {
        clientRef.current.deactivate();
      }
    };
  }, [roomId, myNickname, navigate]);


  // --- 핸들러 함수들 (clientRef.current.publish 사용) ---

  const handleSendMessage = () => {
    if (chatMessage.trim() && clientRef.current && clientRef.current.connected) {
      clientRef.current.publish({
        destination: `/app/lobby/${roomId}/chat`,
        body: JSON.stringify({
          nickname: myNickname,
          content: chatMessage,
          roomId: roomId
        })
      });
      setChatMessage('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSendMessage();
  };

  const handleStartGame = () => {
    if (clientRef.current && clientRef.current.connected && isHost) {
      clientRef.current.publish({
        destination: `/app/lobby/${roomId}/start`,
        body: JSON.stringify({ roomId })
      });
    }
  };


  // --- 렌더링 로직 (기존과 동일) ---
  const playerSlots = Array.from({ length: maxPlayers }, (_, i) => {
    return players[i] ? players[i] : null;
  });
  const halfCount = Math.ceil(maxPlayers / 2);
  const leftSlots = playerSlots.slice(0, halfCount);
  const rightSlots = playerSlots.slice(halfCount, maxPlayers);

  const renderUserCard = (user, index) => {
    const isEmpty = user === null;
    return (
      <div key={index} className={`user-card ${isEmpty ? 'empty' : ''}`}>
        <div className="avatar" />
        <span className="username">
          {isEmpty ? "Empty" : user.nickname}
          {!isEmpty && user.isHost && <span style={{color:'gold', marginLeft:'5px'}}>★</span>}
        </span>
      </div>
    );
  };

  return (
    <div className="lobby-wrapper">
      <button className="back-btn" onClick={() => navigate(-1)}>
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>

      <div className="play-area">
        <div className="play-grid">
          <div className="user-column left">
            {leftSlots.map((user, index) => renderUserCard(user, `left-${index}`))}
          </div>

          <div className="lobby-center">
            <div className="logo-placeholder"><span>LOGO</span></div>
            <div className="room-info-box">
              <h2 className="room-title">즐거운 그림 그리기!</h2>
              <div className="room-detail">
                <span>모드: RANDOM</span>
                <span>•</span>
                <span>{players.length} / {maxPlayers} 명</span>
              </div>
            </div>

            {isHost ? (
              <div className="action-btn-group">
                <button className="start-btn" onClick={handleStartGame}>GAME START</button>
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
            {rightSlots.map((user, index) => renderUserCard(user, `right-${index}`))}
          </div>
        </div>
      </div>

      <div className="chat-area">
        <div className="chat-input-wrapper">
          <input 
            type="text" 
            placeholder="메시지를 입력하세요..." 
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="send-btn" onClick={handleSendMessage}>전송</button>
        </div>
      </div>
    </div>
  );
}

export default LobbyScreen;