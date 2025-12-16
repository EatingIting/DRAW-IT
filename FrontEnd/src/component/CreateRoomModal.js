import axios from "axios";
import { useEffect, useState } from "react";
import "./CreateRoomModal.css";
import { useNavigate } from "react-router-dom";
import { nanoid } from "nanoid";
import { API_BASE_URL } from "../api/config";

function CreateRoomModal({ onClose, mode = "create", roomData = null }) {
  const navigate = useNavigate();

  const [lobbyName, setLobbyName] = useState("");
  const [isPasswordOn, setIsPasswordOn] = useState(false);
  const [password, setPassword] = useState("");
  const [modeValue, setModeValue] = useState("RANDOM");
  const [isLoading, setIsLoading] = useState(false);

  // ✅ edit 모드일 때 초기값 주입
  useEffect(() => {
    if (mode === "edit" && roomData) {
      setLobbyName(roomData.name ?? "");
      setModeValue(roomData.mode ?? "RANDOM");
      const pw = roomData.password ?? "";
      setIsPasswordOn(!!pw);
      setPassword(pw);
    }
  }, [mode, roomData]);

  const handleTogglePassword = () => {
    setIsPasswordOn((prev) => {
      const next = !prev;
      if (!next) setPassword("");
      return next;
    });
  };

  const hostNickname = sessionStorage.getItem("nickname");

  const isSubmitDisabled =
    lobbyName.trim() === "" || (isPasswordOn && password.trim() === "");

  const handleSubmit = async () => {
    if (isSubmitDisabled) return;

    if (!hostNickname || hostNickname.trim() === "") {
      alert("닉네임을 먼저 입력해주세요.");
      return;
    }

    setIsLoading(true);

    try {
      if (mode === "create") {
        const lobbyId = nanoid(8);

        const userId =
          sessionStorage.getItem("userId") ||
          (() => {
            const id = nanoid(12);
            sessionStorage.setItem("userId", id);
            return id;
          })();

        const payload = {
          id: lobbyId,
          name: lobbyName,
          mode: modeValue,
          password: isPasswordOn ? password : null,
          hostUserId: userId,
          hostNickname: hostNickname,
        };

        await axios.post(`${API_BASE_URL}/lobby`, payload);

        onClose();
        navigate(`/lobby/${lobbyId}`, { state: { nickname: hostNickname } });
        return;
      }

      // ✅ edit 모드
      const payload = {
        name: lobbyName,
        mode: modeValue,
        password: isPasswordOn ? password : null,
      };

      await axios.put(`${API_BASE_URL}/lobby/${roomData.id}`, payload);

      onClose();
    } catch (error) {
      console.log(error);
      alert("요청에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="create-modal-overlay">
      <div className="create-modal">
        <button className="close-btn" onClick={onClose}>✕</button>

        <div className="form-group">
          <label className="label">로비 이름</label>
          <input
            type="text"
            className="input"
            placeholder="로비 이름을 입력하세요"
            value={lobbyName}
            onChange={(e) => setLobbyName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="label">모드</label>

          <div className="mode-group">
            <button
              type="button"
              className={`mode-btn ${modeValue === "RANDOM" ? "active" : ""}`}
              onClick={() => setModeValue("RANDOM")}
            >
              무작위
            </button>

            <button
              type="button"
              className={`mode-btn ${modeValue === "POKEMON" ? "active" : ""}`}
              onClick={() => setModeValue("POKEMON")}
            >
              <img
                src="/img/pokemon_mode.png"
                alt="monster-ball"
                className="mode-icon"
              />
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="password-label">비밀번호</label>

          <div className="password-group">
            <input
              type="password"
              className={`input password-input ${isPasswordOn ? "on" : "off"}`}
              placeholder="비밀번호 (선택)"
              disabled={!isPasswordOn}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              type="button"
              className={`toggle-lock ${isPasswordOn ? "on" : "off"}`}
              onClick={handleTogglePassword}
              aria-pressed={isPasswordOn}
              aria-label="비밀번호 사용 토글"
            >
              <span className="toggle-knob" />
            </button>
          </div>

          <button
            type="button"
            className="create-room-btn"
            onClick={handleSubmit}
            disabled={isSubmitDisabled || isLoading}
          >
            {isLoading ? "처리 중..." : mode === "edit" ? "수정 저장" : "방 생성"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateRoomModal;
