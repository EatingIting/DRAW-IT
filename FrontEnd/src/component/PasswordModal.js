import React, { useState } from 'react';
import './Join.css'; 

const PasswordModal = ({ isOpen, close, submit, roomName }) => {
    const [password, setPassword] = useState("");

    if (!isOpen) return null;

    const handleSubmit = () => {
        submit(password);
        setPassword("");
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3 className="modal-title">🔒 비공개 방 입장</h3>
                <p className="modal-desc">
                    <strong>[{roomName}]</strong> 방의<br/>비밀번호를 입력해주세요.
                </p>
                <input 
                    type="password" 
                    className="modal-input"
                    placeholder="비밀번호"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    autoFocus
                />
                <div className="modal-buttons">
                    <button className="modal-btn cancel" onClick={close}>취소</button>
                    <button className="modal-btn confirm" onClick={handleSubmit}>입장</button>
                </div>
            </div>
        </div>
    );
};

export default PasswordModal;