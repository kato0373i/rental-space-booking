import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { DemoControlPanel } from "../components/DemoControlPanel.js";
import { NotificationLogPanel } from "../components/NotificationLogPanel.js";
import { AvailabilityPage } from "../pages/AvailabilityPage.js";
import { CompletePage } from "../pages/CompletePage.js";
import { ConfirmPage } from "../pages/ConfirmPage.js";
import { LoginPage } from "../pages/LoginPage.js";
import { LookupPage } from "../pages/LookupPage.js";
import { MyReservationsPage } from "../pages/MyReservationsPage.js";
import { SpaceListPage } from "../pages/SpaceListPage.js";
import { useApp } from "./AppContext.js";

export function App() {
  const { session, setSession } = useApp();
  const navigate = useNavigate();

  const logout = () => {
    setSession(null);
    navigate("/");
  };

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          レンタルスペース予約
        </Link>
        <nav>
          <Link to="/">スペース</Link>
          <Link to="/lookup">予約照会</Link>
          {session ? (
            <>
              <Link to="/my">予約履歴</Link>
              <button onClick={logout}>ログアウト</button>
            </>
          ) : (
            <Link to="/login">ログイン</Link>
          )}
        </nav>
      </header>
      <div className="layout">
        <main className="content">
          <Routes>
            <Route path="/" element={<SpaceListPage />} />
            <Route path="/spaces/:spaceId" element={<AvailabilityPage />} />
            <Route path="/confirm" element={<ConfirmPage />} />
            <Route path="/complete" element={<CompletePage />} />
            <Route path="/lookup" element={<LookupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/my" element={<MyReservationsPage />} />
            <Route path="*" element={<p>ページが見つかりません。</p>} />
          </Routes>
        </main>
        <aside className="sidebar">
          <DemoControlPanel />
          <NotificationLogPanel />
        </aside>
      </div>
    </>
  );
}
