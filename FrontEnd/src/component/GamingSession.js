import { useState } from 'react';
import './GamingSession.css'

function GamingSession(){

  const [activeTool, setActiveTool] = useState('pen');

  return(
    <div className="wrapper">
      
      <div className="play-area">

        <div className="drawingBoard" style={{ backgroundImage: "url('/img/board.png')" }}>
          
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