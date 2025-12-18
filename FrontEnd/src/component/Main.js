import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import CreateRoomModal from './CreateRoomModal';
import './Main.css';
import { API_BASE_URL } from '../api/config';

const ROOM_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const ROOM_ID_LENGTH = 8;

function Main() {
  const navigate = useNavigate();

  // 1. 초기값을 세션 스토리지에서 가져옴 (새로고침 해도 유지)
  const [nickname, setNickname] = useState(
    () => sessionStorage.getItem('nickname') || ''
  );
  const [joinLink, setJoinLink] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // 닉네임 입력 여부 체크 (공백 제거 후 확인)
  const hasNickname = nickname.trim().length > 0;

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

  // 2. 닉네임이 변경될 때마다 세션 스토리지 업데이트
  // (크롬과 엣지는 서로 다른 세션 스토리지를 가지므로 자연스럽게 분리됨)
  useEffect(() => {
    if (hasNickname) {
      sessionStorage.setItem('nickname', nickname.trim());
    } else {
      sessionStorage.removeItem('nickname');
    }
  }, [nickname, hasNickname]);

  // 링크 참여 버튼 활성화 조건 (닉네임 필수 + 룸 ID 형식 맞음)
  const isJoinDisabled =
    !hasNickname ||
    !roomId ||
    roomId.length !== ROOM_ID_LENGTH ||
    !ROOM_ID_REGEX.test(roomId);

  const handleJoinRoom = async () => {
    if (isJoinDisabled) return;

    try {
      // 방 존재 여부 확인
      await axios.get(`${API_BASE_URL}/lobby/${roomId}`);

      // 3. 방으로 이동하면서 닉네임 정보를 state로도 전달 (안전장치)
      navigate(`/lobby/${roomId}`, { state: { nickname: nickname.trim() } });
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

        {/* 메인 버튼 그룹 */}
        <div className="btn-group">
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            disabled={!hasNickname} // 닉네임 없으면 비활성화
            style={{ opacity: !hasNickname ? 0.5 : 1, cursor: !hasNickname ? 'not-allowed' : 'pointer' }}
          >
            방만들기
          </button>

          <button
            type="button"
            onClick={() => navigate('/join')}
            disabled={!hasNickname} // 닉네임 없으면 비활성화
            style={{ opacity: !hasNickname ? 0.5 : 1, cursor: !hasNickname ? 'not-allowed' : 'pointer' }}
          >
            참여하기
          </button>
        </div>

        {/* 링크로 바로 참여하기 */}
        <div className="join-link-group">
          <span className="join-label">참여링크 :</span>
          <input
            type="text"
            placeholder="8자리 코드"
            value={joinLink}
            onChange={(e) => setJoinLink(e.target.value)}
            disabled={!hasNickname} // 닉네임 없으면 입력 불가 (선택사항)
          />
          <button
            type="button"
            className="join-btn"
            onClick={handleJoinRoom}
            disabled={isJoinDisabled} // 닉네임 없거나 코드 틀리면 비활성화
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