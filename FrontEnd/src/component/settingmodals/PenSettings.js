
import { HexColorPicker } from "react-colorful";
import './PenSettings.css'

function PenSettings({color, setColor, width, setWidth, onClose}){
    return (
        <>
            {/* 1. 화면 전체를 덮는 투명한 막 (여기 누르면 닫힘) */}
            <div className="modalBackdrop" onClick={onClose}></div>

            {/* 2. 안전 구역 (여기까지는 클릭해도 안 닫힘 - 융통성 영역) */}
            <div className="modalSafeZone">
                
                {/* 3. 실제 눈에 보이는 모달창 */}
                <div className="toolSettingsModal">
                    <div className="modalHeader">
                        <span>펜 세팅</span>
                        <button onClick={onClose} className="closeBtn">X</button>
                    </div>

                    <div className="settingSection">
                        <HexColorPicker color={color} onChange={setColor} />
                    </div>

                    <div className="settingSection">
                        <div className="slider-wrapper">
              
                            <input 
                                type="range" 
                                min="1" 
                                max="50" /* 최대값이 50이므로 박스도 50px 이상이어야 함 */
                                value={width} 
                                onChange={(e) => setWidth(parseInt(e.target.value))} 
                                className="custom-slider"
                            />

                            <div className="preview-box">
                                <div 
                                className="size-preview-circle"
                                style={{ 
                                    width: `${width}px`, 
                                    height: `${width}px`,
                                    backgroundColor: color 
                                }}
                                ></div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default PenSettings;