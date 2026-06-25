import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../app/AppContext.js";
import { errorDetails, errorMessage } from "../app/errorMessage.js";
import { yen } from "../app/format.js";

/** 連絡先入力＋決済モックで予約を確定する（FR-F04）。会員はログイン中の customerId で紐づけ。 */
export function ConfirmPage() {
  const { services, draft, session, setDraft, setLastReservation, refresh } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<readonly string[]>([]);
  const [conflict, setConflict] = useState(false);

  if (!draft) {
    return (
      <section>
        <p className="muted">予約内容がありません。スペースを選び直してください。</p>
        <button onClick={() => navigate("/")}>スペース一覧へ</button>
      </section>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    setDetails([]);
    setConflict(false);
    const result = await services.place(
      session
        ? { spaceId: draft.spaceId, slotEpochs: draft.slotEpochs, customerId: session.customerId }
        : { spaceId: draft.spaceId, slotEpochs: draft.slotEpochs, contact: { name, email, phone } },
    );
    setBusy(false);
    if (result.ok) {
      setLastReservation({
        reservationNumber: result.value.reservationNumber,
        priceJpy: result.value.priceJpy,
        spaceName: draft.spaceName,
      });
      setDraft(null);
      refresh(); // 通知ログに確定通知を反映（FR-F10）
      navigate("/complete");
      return;
    }
    if (result.error.kind === "ConflictError") {
      setConflict(true);
      return;
    }
    setError(errorMessage(result.error));
    setDetails(errorDetails(result.error));
  };

  const reselect = () => {
    const id = draft.spaceId;
    setDraft(null);
    navigate(`/spaces/${id}`);
  };

  return (
    <section>
      <h1>予約内容の確認</h1>
      <div className="card">
        <p>
          <strong>{draft.spaceName}</strong>
        </p>
        <p>
          {draft.startLabel} 〜 {draft.endLabel}（{draft.slotEpochs.length}コマ）
        </p>
        <p>
          お支払い金額: <strong>{yen(draft.priceJpy)}</strong>
        </p>
      </div>

      {conflict ? (
        <>
          <div className="banner error">
            すでに予約されました。空き枠を選び直してください。
          </div>
          <button className="primary" onClick={reselect}>
            空き枠を選び直す
          </button>
        </>
      ) : (
        <div className="card">
          {session ? (
            <p className="muted">会員として予約します（連絡先は会員情報を使用）。</p>
          ) : (
            <>
              <h2>予約者情報</h2>
              <label>氏名</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
              <label>メールアドレス</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
              <label>電話番号</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </>
          )}

          <p className="muted" style={{ marginTop: "0.75rem" }}>
            決済はモックです。結果は右の「デモ操作」で切り替えられます。
          </p>

          {error && (
            <div className="banner error">
              {error}
              {details.length > 0 && (
                <ul>
                  {details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button className="primary" onClick={submit} disabled={busy}>
            {busy ? "処理中..." : "予約を確定する"}
          </button>
        </div>
      )}
    </section>
  );
}
