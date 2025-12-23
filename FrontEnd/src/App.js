import { Route, Routes } from 'react-router-dom';
import Join from './component/Join.js';
import Main from './component/Main.js';
import MonthlyRanking from './component/MonthlyRanking.js';
import Fragment from './layout/Fragment.js';
import LobbyScreen from './component/LobbyScreen.js';
import GameScreen from './component/GameScreen.js';
import WordChainScreen from './component/WordChainScreen.js';
import VoteScreen from './component/VoteScreen.js';

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
          <Route path="/vote/:lobbyId" element={<VoteScreen/>}/>
          <Route path="/ranking" element={<MonthlyRanking/>}/>
          <Route path="/wordchain/:lobbyId" element={<WordChainScreen />} />
        </Routes>
      </Fragment>
    </>
  )
}

export default App;
