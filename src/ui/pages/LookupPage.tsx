import { useMemo, useState } from "react";
import type { ReservationView } from "../../composition/webFacade.js";
import { CancelControl } from "../components/CancelControl.js";
import { useApp } from "../app/AppContext.js";
import { errorMessage } from "../app/errorMessage.js";
import { fmtDateTime, statusLabel, yen } from "../app/format.js";

/** 予約照会（番号＋メール, FR-F06）と、その場でのキャンセル（FR-F07）。 */
export function LookupPage() {
  const { services } = useApp();
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [view, setView] = useState<ReservationView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spaceName = useMemo(() => {
    const map = new Map(services.listSpaces().map((s) => [s.spaceId, s.name]));
    return (id: string) => map.get(id) ?? id;
  }, [services]);

  const lookup = () => {
    setError(null);
    const r = services.lookup(number.trim(), email.trim());
    if (r.ok) {
      setView(r.value);
    } else {
      setView(null);
      setError(errorMessage(r.error));
    }
  };

  const refreshView = () => {
    const r = services.lookup(number.trim(), email.trim());
    if (r.ok) setView(r.value);
  };

  return (
    <section>
      <h1>予約照会</h1>
      <div className="card">
        <label>予約番号</label>
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="RSV-..." />
        <label>予約時のメールアドレス</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
        <div style={{ marginTop: "0.75rem" }}>
          <button className="primary" onClick={lookup} disabled={number.trim() === "" || email.trim() === ""}>
            照会する
          </button>
        </div>
        {error && <div className="banner error">{error}</div>}
      </div>

      {view && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{spaceName(view.spaceId)}</strong>
            <span className="tag">{statusLabel(view.status)}</span>
          </div>
          <p className="muted">
            {fmtDateTime(view.startAt)} 〜 {fmtDateTime(view.endAt)} / {yen(view.priceJpy)}
          </p>
          <p className="muted">予約番号 {view.reservationNumber}</p>
          {view.status === "Confirmed" && (
            <CancelControl
              reservationId={view.reservationId}
              prefilledEmail={email.trim()}
              onCancelled={refreshView}
            />
          )}
        </div>
      )}
    </section>
  );
}
