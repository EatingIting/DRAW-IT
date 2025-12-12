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
          <Route path="/join" element={<Join />} />
        </Routes>
      </Fragment>
    </>
  )
}

export default App;
