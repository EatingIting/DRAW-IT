import { Route, Routes } from 'react-router-dom';
import './App.css';
import Join from './component/Join.js';
import Main from './component/Main.js';
import Fragment from './layout/Fragment.js';
function App() {
  return (
    <>
      <Fragment>
        <Routes>
          <Route path='/' element={<Main />} />
          {/* 메인메뉴 참여하기 버튼(로비페이지) 이동 시 */}
          <Route path="/Join" element={<Join />} />
        </Routes>
      </Fragment>
    </>
  )
}

export default App;
