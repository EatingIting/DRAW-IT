import { useRef, useState, useEffect, use, act } from 'react';
import PenSettings from './settingmodals/PenSettings';
import FillSettings from './settingmodals/FillSettings';
import EraserSettings from './settingmodals/EraserSettings';
import PenIcon from './icons/PenIcon';
import './GamingSession.css'

// 색상 문자열(Hex)을 [r, g, b, a] 배열로 변환하는 함수
  const hexToRgba = (hex) => {
    let c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c = hex.substring(1).split('');
        if(c.length === 3){
            c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c = '0x'+c.join('');
        return [(c>>16)&255, (c>>8)&255, c&255, 255];
    }
    // #RRGGBBAA 형식인 경우
    if (/^#([A-Fa-f0-9]{8})$/.test(hex)) {
          c = parseInt(hex.substring(1), 16);
          return [(c>>24)&255, (c>>16)&255, (c>>8)&255, c&255];
      }
      return [0, 0, 0, 255]; // 기본값 검정
  }

function GamingSession(){
  const [activeTool, setActiveTool] = useState('pen');

  const [penColor, setPenColor] = useState('#000000ff');
  const [penWidth, setPenWidth] = useState(5);

  const [fillColor, setFillColor] = useState('#ff000ff');

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
        // 2. 펜 모드: 정상적으로 위에 그림 ('source-over'), 채우기 모드
        contextRef.current.globalCompositeOperation = 'source-over';
        contextRef.current.strokeStyle = penColor;
        contextRef.current.lineWidth = penWidth;
      }
    }
  }, [activeTool, penColor, penWidth, eraserWidth]);

  const handleToolClick = (toolName) => {
    if(activeTool === toolName){
      if(toolName === 'pen' || toolName === 'eraser' || toolName === 'fill'){ // 토글 열림
        setShowModal(!showModal);
      }
    }else{
      setActiveTool(toolName);
      setShowModal(false);
    }
  }

  const startDrawing = (e) => {
    if (activeTool === 'fill') {
      const x = e.nativeEvent.offsetX;
      const y = e.nativeEvent.offsetY;
      // 플러드 필 실행
      floodFill(Math.floor(x), Math.floor(y), fillColor);
      return; // 선 그리기 시작 안 함
    }

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
  };

  // 현재 도구에 따른 커서 크기
  const getCursorSize = () => {
    if (activeTool === 'eraser') return eraserWidth; // 지우개 크기 고정 (코드 로직과 맞춤)
    return penWidth; // 펜 크기
  };

  const getCurrentCursorColor = () => {
      if (activeTool === 'pen') return penColor;
      if (activeTool === 'fill') return fillColor;
      return 'rgba(0,0,0,0.5)'; // 지우개 등
  };

  const floodFill = (startX, startY, fillColorHex) => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    const width = canvas.width;
    const height = canvas.height;

    // 1. 현재 캔버스의 픽셀 데이터를 가져옴
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixelData = imageData.data;

    // 2. 시작점의 픽셀 위치 계산
    const startPos = (startY * width + startX) * 4;
    
    // 3. 시작점 색상 기록 (비교용)
    const startR = pixelData[startPos];
    const startG = pixelData[startPos + 1];
    const startB = pixelData[startPos + 2];
    const startA = pixelData[startPos + 3];

    // 4. 채울 색상 변환 (Hex -> RGBA)
    const [fillR, fillG, fillB, fillA] = hexToRgba(fillColorHex);

    // 최적화: 이미 같은 색이면 작업 중단
    if (startR === fillR && startG === fillG && startB === fillB && startA === fillA) {
      return;
    }

    // 5. BFS 탐색을 위한 스택 생성
    const stack = [[startX, startY]];

    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const pixelPos = (y * width + x) * 4;

      // 현재 픽셀이 시작 색상과 같은지 확인 (오차 범위 없이 정확히 일치)
      // 만약 흐릿한 선까지 채우려면 오차 범위(tolerance) 로직이 필요함
      if (
        x >= 0 && x < width && y >= 0 && y < height &&
        pixelData[pixelPos] === startR &&
        pixelData[pixelPos + 1] === startG &&
        pixelData[pixelPos + 2] === startB &&
        pixelData[pixelPos + 3] === startA
      ) {
        // 색상 변경
        pixelData[pixelPos] = fillR;
        pixelData[pixelPos + 1] = fillG;
        pixelData[pixelPos + 2] = fillB;
        pixelData[pixelPos + 3] = fillA;

        // 8 way 픽셀을 스택에 추가
        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
        stack.push([x + 1, y + 1]);
        stack.push([x - 1, y - 1]);
        stack.push([x - 1, y + 1]);
        stack.push([x + 1, y - 1]);
      }
    }

    // 6. 변경된 픽셀 데이터를 캔버스에 다시 그림
    ctx.putImageData(imageData, 0, 0);
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
          // [변경 4] 커서 테두리 색상도 현재 도구 색상 따라가게 설정
          border: activeTool === 'eraser' ? '1px solid rgba(0,0,0,0.5)' : `1px solid ${getCurrentCursorColor()}`,
          // [변경 5] 커서 배경색도 현재 도구 색상 사용
          backgroundColor: activeTool === 'eraser' ? 'rgba(255,255,255,0.5)' : getCurrentCursorColor(), 
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
          {showModal && activeTool === 'fill' && (
            <FillSettings
              color={fillColor}
              setColor={setFillColor}
              onClose={() => setShowModal(false)}
              top='60px'
              />
          )}
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
          <div style={{ position: 'relative' }}>
             <img 
               src="/svg/fill.svg" 
               alt="fill" 
               className={`tool-icon ${activeTool === 'fill' ? 'active' : ''}`}
               onClick={() => handleToolClick('fill')} 
             />
             {/* 현재 선택된 페인트통 색상 표시 (선택사항) */}
             <div style={{
                 position: 'absolute', right: 5, bottom: 5, 
                 width: 10, height: 10, borderRadius: '50%', 
                 backgroundColor: fillColor, border: '1px solid #fff'
             }}/>
          </div>
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