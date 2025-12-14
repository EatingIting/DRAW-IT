import { Route, Routes } from 'react-router-dom';
import './App.css';
import Join from './component/Join.js';
import GamingSession from './component/GamingSession.js';
import Main from './component/Main.js';
import { Fragment } from 'react/jsx-runtime';
function App() {
  return (
    <>
      <Fragment>
        <Routes>
          <Route path='/' element={<Main />} />
          <Route path="/join" element={<Join />} />
          <Route path="/gamingSession" element={<GamingSession/>}/>
        </Routes>
      </Fragment>
    </>
  )
}

export default App;
