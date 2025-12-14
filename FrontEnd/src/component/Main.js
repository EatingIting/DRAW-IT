import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CreateRoomModal from './CreateRoomModal';
import './Main.css';

function Main() {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  return (
    <div className="main-wrapper">
      <div className='hero'>
        <img src='/img/logo.png' className='logo' alt='draw-it!'></img>
        <div className='title'>그림으로 소통하는 실시간 게임!</div>
      </div>
      <div className='rectangle'>
        <div className="start-text">게임 시작하기</div>
        <div className='btn-group'>
          <button
            type='button'
            onClick={() => {setIsCreateModalOpen(true)}}>방만들기</button>
          <button type='button' onClick={() => navigate("/join")}>참여하기</button>
        </div>
        <div className="join-link-group">
          <span className="join-label">참여링크 :</span>
          <input type="text" />
          <button type="button" className="join-btn">참가하기</button>
        </div>
      </div>

      {isCreateModalOpen && (
        <CreateRoomModal onClose={() => {setIsCreateModalOpen(false)}} />
      )}
    </div>
  );
}

export default Main;