// src/App.jsx
import { Router, Route } from "@solidjs/router"; // [변경] Routes 제거, Router 추가
import PhaserGame from "./components/PhaserGame";
import DevPage from "./pages/DevPage";

function App() {
  return (
    // [변경] <Routes> 태그를 <Router>로 변경
    <Router>
      <Route path="/" component={PhaserGame} />
      <Route path="/dev" component={DevPage} />
    </Router>
  );
}

export default App;