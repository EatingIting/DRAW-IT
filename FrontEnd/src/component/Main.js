import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import CreateRoomModal from './CreateRoomModal';
import './Main.css';

const ROOM_ID_REGEX = /^[a-zA-Z0-9]+$/; //참여링크 영어, 숫자만 허용
const ROOM_ID_LENGTH = 8; //참여링크 8글자 제한

function Main() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(() => {
    return sessionStorage.getItem('nickname') || '';
  });
  const [joinLink, setJoinLink] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const extractRoomId = (value) => {
    if (value.includes('/lobby/')) {
      return value.split('/lobby/')[1];
    }
    return value;
  };

  useEffect(() => {
    if (nickname.trim()) {
      sessionStorage.setItem('nickname', nickname);
    } else {
      sessionStorage.removeItem('nickname');
    }
  }, [nickname]);

  const handleJoinRoom = async () => {
    if (!joinLink.trim()) return;

    const roomId = extractRoomId(joinLink.trim());

    if (!ROOM_ID_REGEX.test(roomId)) {
      alert('올바른 참여 링크를 입력해주세요.');
      return;
    }

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

  const isJoinDisabled =
    !joinLink.trim() || !ROOM_ID_REGEX.test(joinLink);

  return (
    <div className="main-wrapper">
      {/* 상단 로고 */}
      <div className="hero">
        <img src="/img/logo.png" className="logo" alt="draw-it!" />
        <div className="title">그림으로 소통하는 실시간 게임!</div>
      </div>

      {/* 메인 패널 */}
      <div className="rectangle">
        <div className="start-text">게임 시작하기</div>

        {/* 닉네임 입력 */}
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

        {/* 방 생성 / 참여 */}
        <div className="btn-group">
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
          >
            방만들기
          </button>
          <button
            type="button"
            onClick={() => navigate('/join')}
          >
            참여하기
          </button>
        </div>

        {/* 참여 링크 */}
        <div className="join-link-group">
          <span className="join-label">참여링크 :</span>
          <input
            type="text"
            value={joinLink}
            placeholder="영문/숫자 8자리 코드"
            onChange={(e) => {
              const value = e.target.value;
              if (/^[a-zA-Z0-9]*$/.test(value) && value.length <= ROOM_ID_LENGTH) {
                setJoinLink(value);
              }
            }}
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

      <div className='monthlyRanking'>
        <img src="/img/monRank.png" className="rankLogo" alt="MonthlyRanking"/>
      </div>

      {/* 방 생성 모달 */}
      {isCreateModalOpen && (
        <CreateRoomModal
          onClose={() => setIsCreateModalOpen(false)}
        />
      )}
    </div>
  );
}

export default Main;
