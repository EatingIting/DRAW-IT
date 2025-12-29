import axios from 'axios';
import { nanoid } from 'nanoid'; // ✅ 이거 꼭 필요함!
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../api/config';
import CreateRoomModal from './CreateRoomModal';
import './Main.css';

const ROOM_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const ROOM_ID_LENGTH = 8;

function Main() {
  const navigate = useNavigate();

  // 1. 닉네임 가져오기
  const [nickname, setNickname] = useState(
    () => sessionStorage.getItem('nickname') || ''
  );
  const [joinLink, setJoinLink] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // ✨ [추가] 앱 시작하자마자 내 ID(userId)를 고정해버림!
  useEffect(() => {
      let uid = sessionStorage.getItem("userId");
      if (!uid) {
          uid = nanoid(12);
          sessionStorage.setItem("userId", uid);
      }
      // 개발용 로그 (확인용)
      console.log("Current User ID:", uid);
  }, []);

  const hasNickname = nickname.trim().length > 0;

  // ... (나머지 extractRoomId, roomId, handleJoinRoom 로직은 그대로 유지) ...
  const extractRoomId = (value) => {
    if (value.includes('/lobby/')) return value.split('/lobby/')[1];
    return value;
  };
  const roomId = useMemo(() => extractRoomId(joinLink.trim()), [joinLink]);

  useEffect(() => {
    if (hasNickname) sessionStorage.setItem('nickname', nickname.trim());
    else sessionStorage.removeItem('nickname');
  }, [nickname, hasNickname]);

  const isJoinDisabled = !hasNickname || !roomId || roomId.length !== ROOM_ID_LENGTH || !ROOM_ID_REGEX.test(roomId);

  const handleJoinRoom = async () => {
    if (isJoinDisabled) return;
    try {
      await axios.get(`${API_BASE_URL}/lobby/${roomId}`);

      // 3. 방으로 이동하면서 닉네임 정보를 state로도 전달 (안전장치)
      navigate(`/lobby/${roomId}`, { state: { nickname: nickname.trim() } });
    } catch (error) {
      if (error.response?.status === 404) alert('존재하지 않는 방입니다.');
      else alert('방 정보를 확인할 수 없습니다.');
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
        <div className="nickname-group">
          <span className="nickname-label">닉네임</span>
          <input
            type="text"
            className="main-nickname-input"
            placeholder="닉네임 입력"
            value={nickname}
            maxLength={5}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>

        <div className="btn-group">
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            disabled={ !hasNickname }
            style={{ opacity: !hasNickname ? 0.5 : 1, cursor: !hasNickname ? 'not-allowed' : 'pointer' }}
          >
            방만들기
          </button>

          <button
            type="button"
            onClick={() => navigate('/join')}
            disabled={ !hasNickname }
            style={{ opacity: !hasNickname ? 0.5 : 1, cursor: !hasNickname ? 'not-allowed' : 'pointer' }}
          >
            참여하기
          </button>
        </div>

        <div className="join-link-group">
          <span className="join-label">참여링크 :</span>
          <input
            type="text"
            placeholder="8자리 코드"
            value={joinLink}
            onChange={(e) => setJoinLink(e.target.value)}
            disabled={!hasNickname}
          />
          <button
            type="button"
            className="join-btn"
            onClick={handleJoinRoom}
            disabled={isJoinDisabled}
            style={{ opacity: isJoinDisabled ? 0.5 : 1, cursor: isJoinDisabled ? 'not-allowed' : 'pointer' }}
          >
            참가하기
          </button>
        </div>
      </div>

      <div className='monthlyRanking' onClick={() => navigate('/ranking')}>
        <img src="/img/monRank.png" className="rankLogo" alt="MonthlyRanking"/>
      </div>

      {/* 방 생성 모달 */}
      {isCreateModalOpen && (
        <CreateRoomModal
          onClose={() => setIsCreateModalOpen(false)}
          nickname={nickname.trim()} // 모달에도 닉네임 전달
        />
      )}
    </div>
  );
}

export default Main;