import { Link } from "react-router-dom";

/** 管理ダッシュボード（FR-AD01 後の入口）。 */
export function AdminDashboard() {
  return (
    <section>
      <h1>管理ダッシュボード</h1>
      <div className="grid">
        <div className="card">
          <h2>スペース管理</h2>
          <p className="muted">登録・編集・公開停止/再開（FR-AD02〜04）</p>
          <Link to="/admin/spaces">
            <button className="primary">スペース一覧へ</button>
          </Link>
        </div>
        <div className="card">
          <h2>予約管理</h2>
          <p className="muted">全予約の一覧・強制キャンセル・ノーショー（FR-AD05〜07）</p>
          <Link to="/admin/reservations">
            <button className="primary">予約一覧へ</button>
          </Link>
        </div>
      </div>
    </section>
  );
}
