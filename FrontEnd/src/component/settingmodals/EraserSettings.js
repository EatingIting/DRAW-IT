import './ModalSettings.css';

const EraserSettings = ({ width, setWidth, onClose, top='0px' }) => {
  return (
    <>
      {/* 1. 뒷배경 (클릭 시 닫힘) */}
      <div className="modalBackdrop" onClick={onClose} />

      {/* 2. 위치 잡는 구역 (툴박스 기준) */}
      <div className="modalSafeZone" style={{top: top}}>
        
        {/* 3. 실제 하얀색 모달창 */}
        <div className="toolSettingsModal">
          
          {/* 헤더 */}
          <div className="modalHeader">
            <p>지우개 크기</p>
            <button className="closeBtn" onClick={onClose}>&times;</button>
          </div>
          
          {/* 슬라이더 영역 (미리보기 + 슬라이더) */}
          <div className="slider-wrapper">
            
            {/* 미리보기 원 상자 (50x50 고정) */}
            <div className="preview-box">
              <div 
                className="size-preview-circle"
                style={{
                  width: `${width}px`,
                  height: `${width}px`,
                  backgroundColor: '#ffffff', // 지우개는 흰색
                  border: '1px solid #000'    // 잘 보이게 테두리
                }}
              />
            </div>

            {/* 슬라이더 */}
            <input 
              type="range" 
              min="5" 
              max="50" 
              value={width} 
              onChange={(e) => setWidth(Number(e.target.value))} 
              className="custom-slider"
            />
          </div>

        </div>
      </div>
    </>
  );
};

export default EraserSettings;