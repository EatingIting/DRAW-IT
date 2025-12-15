import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import CreateRoomModal from './CreateRoomModal';
import './Main.css';

const ROOM_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const ROOM_ID_LENGTH = 8;

function Main() {
  const navigate = useNavigate();

  const [nickname, setNickname] = useState(
    () => sessionStorage.getItem('nickname') || ''
  );
  const [joinLink, setJoinLink] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const extractRoomId = (value) => {
    if (value.includes('/lobby/')) {
      return value.split('/lobby/')[1];
    }
    return value;
  };

  const roomId = useMemo(
    () => extractRoomId(joinLink.trim()),
    [joinLink]
  );

  useEffect(() => {
    if (nickname.trim()) {
      sessionStorage.setItem('nickname', nickname);
    } else {
      sessionStorage.removeItem('nickname');
    }
  }, [nickname]);

  const isJoinDisabled =
    !roomId ||
    roomId.length !== ROOM_ID_LENGTH ||
    !ROOM_ID_REGEX.test(roomId);

  const handleJoinRoom = async () => {
    if (isJoinDisabled) return;

    try {
      await axios.get(`http://localhost:8080/lobby/${roomId}`);
      navigate(`/lobby/${roomId}`);
    } catch (error) {
      if (error.response?.status === 404) {
        alert('존재하지 않는 방입니다.');
      } else {
        alert('방 정보를 확인할 수 없습니다.');
      }
    }
  };

  return (
    <div className="main-wrapper">
      <div className="hero">
        <img src="/img/logo.png" className="logo" alt="draw-it!" />
        <div className="title">그림으로 소통하는 실시간 게임!</div>
      </div>

      <div className="rectangle">
        <div className="start-text">게임 시작하기</div>

        {/* 닉네임 */}
        <div className="nickname-group">
          <span className="nickname-label">닉네임</span>
          <input
            type="text"
            className="nickname-input"
            placeholder="닉네임 입력"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>

        {/* 버튼 */}
        <div className="btn-group">
          <button type="button" onClick={() => setIsCreateModalOpen(true)}>
            방만들기
          </button>
          <button type="button" onClick={() => navigate('/join')}>
            참여하기
          </button>
        </div>

        {/* 참여 링크 */}
        <div className="join-link-group">
          <span className="join-label">참여링크 :</span>
          <input
            type="text"
            placeholder="8자리 코드"
            value={joinLink}
            onChange={(e) => setJoinLink(e.target.value)}
          />
          <button
            type="button"
            className="join-btn"
            onClick={handleJoinRoom}
            disabled={isJoinDisabled}
          >
            참가하기
          </button>
        </div>
      </div>

      {isCreateModalOpen && (
        <CreateRoomModal onClose={() => setIsCreateModalOpen(false)} />
      )}
    </div>
  );
}

export default Main;
