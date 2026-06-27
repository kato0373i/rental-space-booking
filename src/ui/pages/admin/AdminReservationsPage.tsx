import { useMemo, useState } from "react";
import type { PageDto, ReservationRow } from "../../../composition/webFacade.js";
import { useApp } from "../../app/AppContext.js";
import { errorMessage } from "../../app/errorMessage.js";
import { fmtDateTime, statusLabel, yen } from "../../app/format.js";

const STATUSES = ["", "Pending", "Confirmed", "Cancelled", "NoShow", "Aborted"] as const;
const SIZE = 20;

/** 全予約一覧・絞り込み・ページング＋強制キャンセル/ノーショー（FR-AD05〜08）。 */
export function AdminReservationsPage() {
  const { services, session, refresh } = useApp();
  const [status, setStatus] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [pageData, setPageData] = useState<PageDto<ReservationRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const spaces = useMemo(
    () => (session ? services.admin.listSpaces(session) : []),
    [services, session],
  );
  const spaceName = useMemo(() => {
    const map = new Map(spaces.map((s) => [s.spaceId, s.name]));
    return (id: string) => map.get(id) ?? id;
  }, [spaces]);

  if (!session) return null;

  const load = (page: number) => {
    setError(null);
    const r = services.admin.listReservations(session, {
      status,
      spaceId,
      fromDayIso: fromDay,
      toDayIso: toDay,
      page,
      size: SIZE,
    });
    if (r.ok) setPageData(r.value);
    else {
      setPageData(null);
      setError(errorMessage(r.error));
    }
  };

  const forceCancel = async (reservationId: string, overrideZeroRate: boolean) => {
    setBusy(true);
    setError(null);
    const r = await services.admin.forceCancel(session, reservationId, overrideZeroRate);
    setBusy(false);
    if (!r.ok) setError(errorMessage(r.error));
    else {
      refresh();
      load(pageData?.page ?? 1);
    }
  };

  const markNoShow = (reservationId: string) => {
    const r = services.admin.markNoShow(session, reservationId);
    if (!r.ok) setError(errorMessage(r.error));
    else load(pageData?.page ?? 1);
  };

  const totalPages = pageData ? Math.max(1, Math.ceil(pageData.total / pageData.size)) : 1;

  return (
    <section>
      <h1>予約管理</h1>
      <div className="card">
        <div className="row">
          <div>
            <label>状態</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s || "all"} value={s}>
                  {s === "" ? "すべて" : statusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>スペース</label>
            <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
              <option value="">すべて</option>
              {spaces.map((s) => (
                <option key={s.spaceId} value={s.spaceId}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>開始日(以降)</label>
            <input type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} />
          </div>
          <div>
            <label>終了日(より前)</label>
            <input type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} />
          </div>
          <button className="primary" onClick={() => load(1)}>
            検索
          </button>
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}

      {pageData && (
        <>
          {pageData.items.length === 0 ? (
            <p className="muted">該当する予約がありません。</p>
          ) : (
            <ul className="reset">
              {pageData.items.map((r) => (
                <li key={r.reservationId} className="card">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>
                      {spaceName(r.spaceId)} / {r.reservationNumber}
                    </strong>
                    <span className="tag">{statusLabel(r.status)}</span>
                  </div>
                  <p className="muted">
                    {fmtDateTime(r.startAt)} 〜 {fmtDateTime(r.endAt)} / {yen(r.priceJpy)}
                  </p>
                  <p className="muted">予約者 {r.maskedRecipient}</p>
                  {r.status === "Confirmed" && (
                    <div className="row">
                      <button disabled={busy} onClick={() => forceCancel(r.reservationId, false)}>
                        強制キャンセル
                      </button>
                      <button disabled={busy} onClick={() => forceCancel(r.reservationId, true)}>
                        強制キャンセル（料率0%）
                      </button>
                      <button onClick={() => markNoShow(r.reservationId)}>ノーショー</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">
              全 {pageData.total} 件 / {pageData.page} / {totalPages} ページ
            </span>
            <div className="row">
              <button disabled={pageData.page <= 1} onClick={() => load(pageData.page - 1)}>
                前へ
              </button>
              <button disabled={pageData.page >= totalPages} onClick={() => load(pageData.page + 1)}>
                次へ
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
