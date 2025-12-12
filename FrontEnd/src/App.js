import './App.css';
import Fragment from './layout/Fragment.js';
import Main from './component/Main.js';
import { Route, Routes } from 'react-router-dom';
import Create from './component/Create.js';
import Join from './component/Join.js';
function App() {
  return (
    <>
      <Fragment>
        <Routes>
          <Route path='/' element={<Main />} />
          <Route path="/create" element={<Create />} />

          {/* 메인메뉴 참여하기 버튼(로비페이지) 이동 시 */}
          <Route path="/Join" element={<Join />} />
        </Routes>
      </Fragment>
    </>
  )
}

export default App;
