import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CancelControl } from "../components/CancelControl.js";
import type { ReservationView } from "../../composition/webFacade.js";
import { useApp } from "../app/AppContext.js";
import { fmtDateTime, statusLabel, yen } from "../app/format.js";

/** 会員の予約履歴一覧（FR-F09）。確定予約はキャンセル可能。 */
export function MyReservationsPage() {
  const { services, session, tick } = useApp();

  // listMyReservations は非同期（DBバックエンド対応, ADR-AB01）。state + effect で取得する。
  const [reservations, setReservations] = useState<ReservationView[]>([]);
  useEffect(() => {
    if (!session) {
      setReservations([]);
      return;
    }
    let alive = true;
    void services.listMyReservations(session.customerId).then((rs) => {
      if (alive) setReservations(rs);
    });
    return () => {
      alive = false;
    };
  }, [services, session, tick]);

  const spaceName = useMemo(() => {
    const map = new Map(services.listSpaces().map((s) => [s.spaceId, s.name]));
    return (id: string) => map.get(id) ?? id;
  }, [services]);

  if (!session) {
    return (
      <section>
        <h1>予約履歴</h1>
        <p className="muted">予約履歴を見るにはログインしてください。</p>
        <Link to="/login">
          <button className="primary">ログイン</button>
        </Link>
      </section>
    );
  }

  return (
    <section>
      <h1>予約履歴</h1>
      {reservations.length === 0 ? (
        <p className="muted">予約がありません。</p>
      ) : (
        <ul className="reset">
          {reservations.map((r) => (
            <li key={r.reservationId} className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{spaceName(r.spaceId)}</strong>
                <span className="tag">{statusLabel(r.status)}</span>
              </div>
              <p className="muted">
                {fmtDateTime(r.startAt)} 〜 {fmtDateTime(r.endAt)} / {yen(r.priceJpy)}
              </p>
              <p className="muted">予約番号 {r.reservationNumber}</p>
              {r.status === "Confirmed" && <CancelControl reservationId={r.reservationId} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
