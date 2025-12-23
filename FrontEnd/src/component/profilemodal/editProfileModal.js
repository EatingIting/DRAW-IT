import { useState, useEffect } from "react";
import "../LobbyScreen.css"; 

function EditProfileModal({
  isOpen,
  onClose,
  currentNickname,
  currentProfileIndex, // default 혹은 1~10
  usedProfileIndexes = [], // 값이 안 넘어오면 빈 배열 (에러 방지)
  onConfirm,
}) {
  const [nickname, setNickname] = useState(currentNickname || "");
  const [selectedProfile, setSelectedProfile] = useState(
    (currentProfileIndex === "default" || !currentProfileIndex) ? null : currentProfileIndex
  );

  // 모달이 열릴 때마다 초기화
  useEffect(() => {
    if (isOpen) {
      setNickname(currentNickname || "");
      // 모달 열릴 때마다 상태 동기화
      setSelectedProfile(
        (currentProfileIndex === "default" || !currentProfileIndex) ? null : currentProfileIndex
      );
    }
  }, [isOpen, currentNickname, currentProfileIndex]);

  if (!isOpen) return null;

  const handleProfileClick = (index) => {
    // 사용 중인 프로필(나 제외)은 클릭 방지
    // usedProfileIndexes가 빈 배열이어도 안전하게 동작함
    if (usedProfileIndexes.includes(index) && index !== currentProfileIndex) {
      return;
    }
    setSelectedProfile(index);
  };

  const handleConfirm = () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      alert("닉네임을 입력해주세요.");
      return;
    }
    
    // ★ 추가됨: 프로필을 선택하지 않고 확인을 누른 경우 처리
    // 만약 "기본 이미지 상태"를 유지하게 하려면 selectedProfile이 null일 때 그냥 두거나 경고를 띄울 수 있습니다.
    // 여기서는 "프로필을 선택해주세요"라고 알림을 띄우는 것이 일반적입니다.
    if (!selectedProfile) {
      alert("프로필 이미지를 선택해주세요!");
      return;
    }

    onConfirm(trimmed, selectedProfile);
  };

  return (
    <div className="modal-overlay">
      <div className="profile-modal-container">
        {/* 우측 상단 닫기 버튼 */}
        <button className="close-x-btn" onClick={onClose}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <h2 className="modal-label">프로필</h2>

        {/* 프로필 선택 그리드 (2행 5열 -> 10개) */}
        <div className="profile-grid">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((idx) => {
            // 사용 중인지 확인
            const isUsed = usedProfileIndexes.includes(idx) && idx !== currentProfileIndex;
            const isSelected = selectedProfile === idx;

            return (
              <div
                key={idx}
                className={`profile-item ${isSelected ? "selected" : ""} ${isUsed ? "disabled" : ""}`}
                onClick={() => handleProfileClick(idx)}
              >
                {/* 이미지 경로: public/img/profile/profile1.jpg ... */}
                <img
                  src={`/img/profile/profile${idx}.jpg`}
                  alt={`profile-${idx}`}
                  className="profile-img"
                />
                {/* 사용 중(비활성)일 때 덮을 레이어 */}
                {isUsed && <div className="disabled-overlay"></div>}
              </div>
            );
          })}
        </div>
        
        <div className="disabled-info-text">이미 선택된 프로필은 비활성화</div>

        <h2 className="modal-label">닉네임</h2>

        <input
          type="text"
          className="nickname-input"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
          onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
        />

        {/* 확인(저장) 버튼 */}
        <button className="save-profile-btn" onClick={handleConfirm}>
          확인
        </button>
      </div>
    </div>
  );
}

export default EditProfileModal;