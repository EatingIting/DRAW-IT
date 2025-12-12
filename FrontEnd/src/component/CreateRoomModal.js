import axios from "axios";
import { useState } from "react";
import "./CreateRoomModal.css";

function CreateRoomModal({ onClose }) {
  const [lobbyName, setLobbyName] = useState('');
  const [isPasswordOn, setIsPasswordOn] = useState(false);
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState("RANDOM");
  const [isLoading, setIsLoading] = useState(false);

  const handleTogglePassword = () => {
    setIsPasswordOn((prev) => {
      const next = !prev;

      if(!next) setPassword('');

      return next;
    })
  }

  const handleCreateRoom = async () => {
    console.log("임시 방 생성 (백엔드 로직 구현)");
    console.log("로비 이름: ", lobbyName);
    console.log("모드 : ", mode);
    console.log("비밀번호 : ", password || "(없음)");
    if(lobbyName.trim() === "") return;
    setIsLoading(true);

    const payload = {
      lobbyName,
      mode,
      password: isPasswordOn ? password : null
    };

    try {
      const response = await axios.post("http://localhost:8080/lobby", {
        lobbyName,
        mode,
        password : isPasswordOn ? password : null
      });
      console.log("방 생성 성공" , response.data);
      onClose();
    } catch (error) {
      console.log(error);
      alert("방 생성에 실패했습니다.");
    } finally {
      setIsLoading(true);
    }
  };

  const isCreateDisabled = isPasswordOn && password.trim() === "";

  return (
    <div className="create-modal-overlay">
      <div className="create-modal">

        {/* 닫기 버튼 */}
        <button className="close-btn" onClick={onClose}>
          ✕
        </button>

        {/* 로비 이름 */}
        <div className="form-group">
          <label className="label">로비 이름</label>
          <input
            type="text"
            className="input"
            placeholder="로비 이름을 입력하세요"
            value={lobbyName}
            onChange={e => setLobbyName(e.target.value)}
          />
        </div>

        {/* 모드 */}
        <div className="form-group">
          <label className="label">모드</label>

          <div className="mode-group">
            {/* 무작위 */}
            <button
              type="button"
              className={`mode-btn ${mode === "RANDOM" ? "active" : ""}`}
              onClick={() => setMode("RANDOM")}
            >
              무작위
            </button>

            {/* 몬스터볼 */}
            <button
              type="button"
              className={`mode-btn ${mode === "POKEMON" ? "active" : ""}`}
              onClick={() => setMode("POKEMON")}
            >
              <img
                src="/img/pokemon mode.png"
                alt="monster-ball"
                className="mode-icon"
              />
            </button>
          </div>
        </div>

        {/* 비밀번호 */}
        <div className="form-group">
          <label className="label">비밀번호</label>

          <div className="password-group">
            <input
              type="password"
              className={`input password-input ${isPasswordOn ? "on" : "off"}`}
              placeholder="비밀번호 (선택)"
              disabled={!isPasswordOn}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            {/* 토글 스위치 */}
            <button
              type="button"
              className={`toggle-lock ${isPasswordOn ? "on" : "off"}`}
              onClick={handleTogglePassword}
              aria-pressed={isPasswordOn}
              aria-label="비밀번호 사용 토글"
            >
              <span className="toggle-knob" />
            </button>
            {/* 방 생성 버튼 */}
            <button
              type="button"
              className="create-room-btn"
              onClick={handleCreateRoom}
              disabled={isCreateDisabled}
            >
              {isLoading ? "생성 중..." : "빙 생성"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default CreateRoomModal;
