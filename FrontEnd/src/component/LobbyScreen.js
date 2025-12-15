import React from 'react';
import "./LobbyScreen.css";

function LobbyScreen({ onStartGame }) {
  const dummyUsersLeft = ['User1', 'User2', 'User3', 'User4', 'User5'];
  const dummyUsersRight = ['User6', 'User7', 'User8', 'User9', 'User10'];

  return (
    <div className="lobby-wrapper">

      {/* ===== 상단 메인 게임 영역 ===== */}
      <div className="play-area">
        {/* 중앙 정렬을 위한 그리드 컨테이너 */}
        <div className="play-grid">
          
          {/* 왼쪽 유저 리스트 */}
          <div className="user-column left">
            {dummyUsersLeft.map((user, index) => (
              <div key={`left-${index}`} className="user-card">
                <div className="avatar" />
                <span className="username">{user}</span>
              </div>
            ))}
          </div>

          {/* 중앙 정보 */}
          <div className="lobby-center">
            <div className="logo-placeholder">
               <span>LOGO</span>
            </div>
            
            <div className="room-info-box">
              <h2 className="room-title">즐거운 그림 그리기!</h2>
              <div className="room-detail">
                <span>모드: RANDOM</span>
                <span>•</span>
                <span>8 / 8 명</span>
              </div>
            </div>

            <button className="start-btn" onClick={onStartGame}>
              GAME START
            </button>
          </div>

          {/* 오른쪽 유저 리스트 */}
          <div className="user-column right">
            {dummyUsersRight.map((user, index) => (
              <div key={`right-${index}`} className="user-card">
                <div className="avatar" />
                <span className="username">{user}</span>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ===== 하단 채팅 영역 ===== */}
      <div className="chat-area">
        <div className="chat-input-wrapper">
          <input type="text" placeholder="메시지를 입력하세요..." />
          <button className="send-btn">전송</button>
        </div>
      </div>

    </div>
  );
}

export default LobbyScreen;