import { Route, Routes } from 'react-router-dom';
import Join from './component/Join.js';
import GamingSession from './component/GamingSession.js';
import Main from './component/Main.js';
import MonthlyRanking from './component/MonthlyRanking.js';
import Fragment from './layout/Fragment.js';
function App() {
  return (
    <>
      <Fragment>
        <Routes>
          <Route path='/' element={<Main />} />
          <Route path="/join" element={<Join />} />
          <Route path="/gamingSession" element={<GamingSession/>}/>
          <Route path="/ranking" element={<MonthlyRanking/>}/>
        </Routes>
      </Fragment>
    </>
  )
}

export default App;
