import { Link } from "react-router-dom";
import { useApp } from "../app/AppContext.js";
import { yen } from "../app/format.js";

/** 予約完了（予約番号の提示）。 */
export function CompletePage() {
  const { lastReservation } = useApp();

  if (!lastReservation) {
    return (
      <section>
        <p className="muted">表示する予約がありません。</p>
        <Link to="/">スペース一覧へ</Link>
      </section>
    );
  }

  return (
    <section>
      <h1>予約が確定しました</h1>
      <div className="card">
        <p>
          予約番号: <strong>{lastReservation.reservationNumber}</strong>
        </p>
        <p>スペース: {lastReservation.spaceName}</p>
        <p>確定金額: {yen(lastReservation.priceJpy)}</p>
      </div>
      <p className="muted">予約番号と予約時メールで「予約照会」から確認・キャンセルできます。</p>
      <div className="row">
        <Link to="/lookup">
          <button>予約照会へ</button>
        </Link>
        <Link to="/">
          <button>続けて予約する</button>
        </Link>
      </div>
    </section>
  );
}
