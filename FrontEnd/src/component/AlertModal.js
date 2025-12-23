import React from 'react';
import './Join.css'; // 스타일은 Join.css 공유

const AlertModal = ({ isOpen, message, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{ zIndex: 10000 }}> {/* 다른 모달보다 더 위에 뜨게 */}
            <div className="modal-content">
                <h3 className="modal-title" style={{ color: '#d63031' }}>🚫 알림</h3>
                <p className="modal-desc" style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                    {message}
                </p>
                
                <div className="modal-buttons">
                    <button className="modal-btn confirm" onClick={onClose}>
                        확인
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertModal;