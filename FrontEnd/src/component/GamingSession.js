import { useRef, useState, useEffect, use, act } from 'react';
import PenSettings from './settingmodals/PenSettings';
import PenIcon from './icons/PenIcon';
import './GamingSession.css'

function GamingSession(){
  const [activeTool, setActiveTool] = useState('pen');

  const [penColor, setPenColor] = useState('#ff0000');
  const [penWidth, setPenWidth] = useState(5);
  const [showModal, setShowModal] = useState(false);

  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const isDrawing = useRef(false);

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
      contextRef.current.strokeStyle = penColor;
      contextRef.current.lineWidth = penWidth;
    }
  }, [penColor, penWidth]);

  const handleToolClick = (toolName) => {
    if(toolName === 'pen'){
      if(activeTool === 'pen'){ // 토글 열림
        console.log("펜 세팅 모달");
        setShowModal(true);
      }else{
        setActiveTool('pen');
        setShowModal(false);
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
    if(!isDrawing.current) return;

    if(activeTool === 'pen'){ // 팬;
      contextRef.current.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      contextRef.current.stroke();
    }
    else if(activeTool === 'eraser'){ // 지우개
      contextRef.current.clearRect(e.nativeEvent.offsetX - 10, e.nativeEvent.offsetY -10, 20, 20);
    }
  };

  const finishDrawing = () => {
    contextRef.current.closePath();
    isDrawing.current = false;
  }

  return(
    <div className="wrapper">
      
      <div className="play-area">

        <div className="drawingBoard" style={{ backgroundImage: "url('/img/board.png')" }}>
          <canvas className="canvas"
                  width={746}
                  height={603}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={finishDrawing}
                  ref={canvasRef}>
          </canvas>
        </div>
        <div className="tool-box">
          { 
            showModal && activeTool === 'pen' && (
              <PenSettings 
                color={penColor} 
                setColor={setPenColor}
                width={penWidth}
                setWidth={setPenWidth}
                onClose={() => setShowModal(false)}
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