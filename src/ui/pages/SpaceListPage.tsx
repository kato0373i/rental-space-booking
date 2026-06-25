import { Link } from "react-router-dom";
import { useApp } from "../app/AppContext.js";

/** スペース一覧（FR-F01）。 */
export function SpaceListPage() {
  const { services } = useApp();
  const spaces = services.listSpaces();

  return (
    <section>
      <h1>スペースを選ぶ</h1>
      {spaces.length === 0 ? (
        <p className="muted">公開中のスペースがありません。</p>
      ) : (
        <div className="grid">
          {spaces.map((s) => (
            <div key={s.spaceId} className="card">
              <h2>{s.name}</h2>
              <p className="muted">
                営業 {s.businessHours} / {s.slotMinutes}分枠 / 定員{s.capacity}名
              </p>
              <p className="muted">
                予約 {s.minSlots}〜{s.maxSlots}コマ
              </p>
              <Link to={`/spaces/${s.spaceId}`}>
                <button className="primary">空き枠を見る</button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
