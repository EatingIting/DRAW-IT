import { Route, Routes } from 'react-router-dom';
import Join from './component/Join.js';
import Main from './component/Main.js';
import MonthlyRanking from './component/MonthlyRanking.js';
import Fragment from './layout/Fragment.js';
import LobbyScreen from './component/LobbyScreen.js';
import GameScreen from './component/GameScreen.js';
import VoteScreent from './component/VoteScreen.js';

function App() {
  return (
    <>
      <Fragment>
        <Routes>
          <Route path='/' element={<Main />} />
          <Route path="/join" element={<Join />} />
          <Route path="/lobby/:lobbyId" element={<LobbyScreen/>}/>
          <Route path="/gaming/:lobbyId" element={<GameScreen/>}/>
          <Route path="/gamingResult/:lobbyId" element={<GameScreen/>}/>
          <Route path="/vote/:lobbyId" element={<VoteScreent/>}/>
          <Route path="/ranking" element={<MonthlyRanking/>}/>
        </Routes>
      </Fragment>
    </>
  )
}

export default App;
