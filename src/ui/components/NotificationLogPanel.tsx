import { useMemo } from "react";
import { useApp } from "../app/AppContext.js";

const kindLabel = (kind: string): string =>
  kind === "Confirmed" ? "確定" : kind === "Cancelled" ? "キャンセル" : "リマインド";

/** モック通知の一覧表示（FR-F10）。本文・宛先はマスク済み（NFR-F02）。 */
export function NotificationLogPanel() {
  const { services, tick } = useApp();
  const messages = useMemo(() => services.notifications(), [services, tick]);

  return (
    <section className="panel">
      <h2>通知ログ</h2>
      <p className="muted">モック送信（PIIマスク済み）</p>
      {messages.length === 0 ? (
        <p className="muted">通知はまだありません。</p>
      ) : (
        <ul className="reset">
          {messages.map((m, i) => (
            <li key={`${m.reservationNumber}-${i}`} className="noti">
              <span className="tag">{kindLabel(m.kind)}</span> {m.reservationNumber}
              <div className="muted">宛先 {m.maskedRecipient}</div>
              <div>{m.body}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
