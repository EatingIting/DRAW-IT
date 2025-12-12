import { useNavigate } from 'react-router-dom';
import './Main.css';

function Main() {
  const navigate = useNavigate();
  return (
    <div className="wrapper">
      <img src='/img/logo.png' className='logo' alt='draw-it!'></img>
      <div className='title'>그림으로 소통하는 실시간 게임!</div>
      <div className='rectangle'>
        <div className="start-text">게임 시작하기</div>
          <div className='btn-group'>
            <button type='button' onClick={() => navigate("/create")}>방만들기</button>
            {/* gjwjddn */}
            <button type='button' onClick={() => navigate("/Join")}>참여하기</button>
          </div>
          <div className="join-link-group">
            <span className="join-label">참여링크 :</span>
            <input type="text" />
            <button type="button" className="join-btn">참가하기</button>
          </div>
        </div>
    </div>
  );
}

export default Main;