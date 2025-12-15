import { useState } from "react";
import GameScreen from "./GameScreen";
import LobbyScreen from "./LobbyScreen";

function GamingSession(){

  const [isGameStarted, setIsGameStarted] = useState(false);

  return(
    <>
      {isGameStarted ? (
        <GameScreen />
      ) : (
        <LobbyScreen onStartGame={() => setIsGameStarted(true)} />
      )}
    </>
  );
}

export default GamingSession;