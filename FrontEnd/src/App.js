import { Route, Routes } from 'react-router-dom';
import Join from './component/Join.js';
import GamingSession from './component/GamingSession.js';
import Main from './component/Main.js';
import Fragment from './layout/Fragment.js';
import Lobby from './component/LobbyScreen.js';
function App() {
  return (
    <>
      <Fragment>
        <Routes>
          <Route path='/' element={<Main />} />
          <Route path="/join" element={<Join />} />
          <Route path="/lobby/:lobbyId" element={<GamingSession/>}/>
          <Route path="/gaming/:lobbyId" element={<GamingSession/>}/>
          <Route path="/gamingResult/:lobbyId" element={<GamingSession/>}/>
          <Route path="/vote/:lobbyId" element={<GamingSession/>}/>
        </Routes>
      </Fragment>
    </>
  )
}

export default App;
