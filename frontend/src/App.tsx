import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';

function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  );
}

export default App;
