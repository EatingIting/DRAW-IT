import { useRef, useState, useEffect, use, act } from 'react';
import PenSettings from './settingmodals/PenSettings';
import EraserSettings from './settingmodals/EraserSettings';
import PenIcon from './icons/PenIcon';
import './GamingSession.css'

function GamingSession(){
  const [activeTool, setActiveTool] = useState('pen');

  const [penColor, setPenColor] = useState('#000000ff');
  const [penWidth, setPenWidth] = useState(5);

  const [eraserWidth, setEraserWidth] = useState(20);
  
  const [showModal, setShowModal] = useState(false);

  const [isHovering, setIsHovering] = useState(false);

  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const isDrawing = useRef(false);

  const cursorRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if(canvas){
      const ctx = canvas.getContext('2d');
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      contextRef.current = ctx;
    }
  }, []);

  useEffect(() => {
    if(contextRef.current){
      if (activeTool === 'eraser') {
        // 1. 지우개 모드: 겹치는 부분을 투명하게 만듦 ('destination-out')
        contextRef.current.globalCompositeOperation = 'destination-out';
        contextRef.current.lineWidth = eraserWidth; // 지우개 크기 (원하는 크기로 조절)
      } else {
        // 2. 펜 모드: 정상적으로 위에 그림 ('source-over')
        contextRef.current.globalCompositeOperation = 'source-over';
        contextRef.current.strokeStyle = penColor;
        contextRef.current.lineWidth = penWidth;
      }
    }
  }, [activeTool, penColor, penWidth, eraserWidth]);

  const handleToolClick = (toolName) => {
    if(activeTool === toolName){
      if(toolName === 'pen' || toolName === 'eraser'){ // 토글 열림
        setShowModal(true);
      }
    }else{
      setActiveTool(toolName);
      setShowModal(false);
    }
  }

  const startDrawing = (e) => {
    contextRef.current.beginPath();
    contextRef.current.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    isDrawing.current = true;
  };

  const draw = (e) => {
    if (cursorRef.current) {
      cursorRef.current.style.top = `${e.clientY}px`;
      cursorRef.current.style.left = `${e.clientX}px`;
    }

    if(!isDrawing.current) return;

    contextRef.current.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    contextRef.current.stroke();
  };

  const finishDrawing = () => {
    contextRef.current.closePath();
    isDrawing.current = false;
  }

  // 현재 도구에 따른 커서 크기
  const getCursorSize = () => {
    if (activeTool === 'eraser') return eraserWidth; // 지우개 크기 고정 (코드 로직과 맞춤)
    return penWidth; // 펜 크기
  };

  return(
    <div className="wrapper">
      
      <div 
        ref={cursorRef}
        style={{
          position: 'fixed',
          pointerEvents: 'none', // 클릭 통과 (필수)
          zIndex: 9999,
          transform: 'translate(-50%, -50%)', // 중앙 정렬
          borderRadius: '50%',
          border: activeTool === 'pen' ? penColor: '1px solid rgba(0,0,0,0.5)', // 테두리
          // 펜일 땐 펜 색상, 아니면 투명
          backgroundColor: activeTool === 'pen' ? penColor : 'rgba(255, 255, 255, 0.3)', 
          // 펜 색상이 너무 투명하면 안보일 수 있으므로 최소한의 불투명도 처리 필요할 수 있음
          width: `${getCursorSize()}px`,
          height: `${getCursorSize()}px`,
          display: isHovering ? 'block' : 'none', // 캔버스 위에 있을 때만 표시
          transition: 'width 0.1s, height 0.1s, background-color 0.1s' // 부드러운 크기 변경
        }}
      />

      <div className="play-area">

        <div className="drawingBoard" style={{ backgroundImage: "url('/img/board.png')" }}>
          <canvas className="canvas"
                  width={746}
                  height={603}
                  style={{cursor: 'none'}}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={finishDrawing}
                  onMouseEnter={() => setIsHovering(true)} // 마우스 진입 감지
                  onMouseLeave={() => setIsHovering(false)} // 마우스 이탈 감지
                  ref={canvasRef}>
          </canvas>
        </div>
        <div className="tool-box" style={{ position: 'relative' }}>
          { 
            showModal && activeTool === 'pen' && (
              <PenSettings 
                color={penColor} 
                setColor={setPenColor}
                width={penWidth}
                setWidth={setPenWidth}
                onClose={() => setShowModal(false)}
                top='-20px'
              />
            )
          }
          {
            showModal && activeTool === 'eraser' && (
              <EraserSettings
                width={eraserWidth}
                setWidth={setEraserWidth}
                onClose={() => setShowModal(false)}
                top='100px'
              />
            )
          }
          <PenIcon 
            color={penColor}
            className={`tool-icon ${activeTool === 'pen' ? 'active' : ''}`}
            onClick={() => handleToolClick('pen')}
          />
          <img 
            src="/svg/fill.svg" 
            alt="fill" 
            className={`tool-icon ${activeTool === 'fill' ? 'active' : ''}`}
            onClick={() => handleToolClick('fill')} />
          <img 
            src="/svg/eraser.svg" 
            alt="eraser" 
            className={`tool-icon ${activeTool === 'eraser' ? 'active' : ''}`}
            onClick={() => handleToolClick('eraser')} />
        </div>

      </div>

    </div>
  )
}

export default GamingSession;