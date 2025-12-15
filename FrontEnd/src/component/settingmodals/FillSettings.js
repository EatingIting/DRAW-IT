import { HexColorPicker } from "react-colorful"; // 사용중인 컬러 피커 라이브러리
import './ModalSettings.css';

const FillSettings = ({ color, setColor, onClose, top = '0px' }) => {
  return (
    <>
      <div className="modalBackdrop" onClick={onClose} />
      
      {/* top props를 받아 위치 조절 */}
      <div className="modalSafeZone" style={{ top: top }}>
        <div className="toolSettingsModal">
          
          <div className="modalHeader">
            <p>채우기 색상</p>
            <button className="closeBtn" onClick={onClose}>&times;</button>
          </div>

          {/* 색상 선택기 영역 */}
          <div style={{ padding: '10px 0' }}>
            <HexColorPicker 
              color={color} 
              onChange={setColor} 
              style={{ width: '100%', height: '150px' }} // CSS 클래스로 대체 가능
            />
          </div>
          
          {/* (선택사항) 현재 색상 코드 표시 */}
          <div style={{ textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
            {color}
          </div>

        </div>
      </div>
    </>
  );
};

export default FillSettings;