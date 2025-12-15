import { useState } from "react";
import GameScreen from "./GameScreen";
import LobbyScreen from "./LobbyScreen";

function GamingSession(){

  const [isGameStarted, setIsGameStarted] = useState(false);

  return(
    <div className="wrapper">
      
      {isGameStarted ? (
        <GameScreen />
      ) : (
        <LobbyScreen onStartGame={() => setIsGameStarted(true)} />
      )}
    </div>
  );
}

export default GamingSession;