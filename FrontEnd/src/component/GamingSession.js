import { useRef, useState, useEffect } from 'react';
import './GamingSession.css'

function GamingSession(){
  const [activeTool, setActiveTool] = useState('pen');
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if(canvas){
      const ctx = canvas.getContext('2d');
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'red';

      contextRef.current = ctx;
    }
  }, []);

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
          <img 
            src="/svg/pen.svg" 
            alt="pen" 
            className={`tool-icon ${activeTool === 'pen' ? 'active' : ''}`}
            onClick={() => setActiveTool('pen')} />
          <img 
            src="/svg/fill.svg" 
            alt="fill" 
            className={`tool-icon ${activeTool === 'fill' ? 'active' : ''}`}
            onClick={() => setActiveTool('fill')} />
          <img 
            src="/svg/eraser.svg" 
            alt="eraser" 
            className={`tool-icon ${activeTool === 'eraser' ? 'active' : ''}`}
            onClick={() => setActiveTool('eraser')} />
        </div>

      </div>

    </div>
  )
}

export default GamingSession;