import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../app/AppContext.js";
import { errorMessage } from "../../app/errorMessage.js";

/** 管理者向けスペース一覧（公開停止含む）と公開停止/再開（FR-AD04）。 */
export function AdminSpacesPage() {
  const { services, session } = useApp();
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const spaces = useMemo(
    () => (session ? services.admin.listSpaces(session) : []),
    [services, session, tick],
  );

  if (!session) return null;

  const toggle = (spaceId: string, publishState: string) => {
    const r =
      publishState === "Published"
        ? services.admin.suspendSpace(session, spaceId)
        : services.admin.resumeSpace(session, spaceId);
    if (!r.ok) {
      setError(errorMessage(r.error));
    } else {
      setError(null);
      setTick((t) => t + 1);
    }
  };

  return (
    <section>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>スペース管理</h1>
        <Link to="/admin/spaces/new">
          <button className="primary">＋ 新規登録</button>
        </Link>
      </div>
      {error && <div className="banner error">{error}</div>}
      <ul className="reset">
        {spaces.map((s) => (
          <li key={s.spaceId} className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{s.name}</strong>
              <span className="tag">{s.publishState === "Published" ? "公開中" : "公開停止"}</span>
            </div>
            <p className="muted">
              営業 {s.businessHours} / {s.slotMinutes}分枠 / 定員{s.capacity} / 予約{s.minSlots}〜
              {s.maxSlots}コマ
            </p>
            <div className="row">
              <Link to={`/admin/spaces/${s.spaceId}/edit`}>
                <button>編集</button>
              </Link>
              <button onClick={() => toggle(s.spaceId, s.publishState)}>
                {s.publishState === "Published" ? "公開停止" : "再開"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
