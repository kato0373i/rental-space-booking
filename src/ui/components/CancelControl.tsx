import { useState } from "react";
import type { CancellationResult } from "../../composition/webFacade.js";
import { useApp } from "../app/AppContext.js";
import { errorMessage } from "../app/errorMessage.js";
import { yen } from "../app/format.js";

type Props = {
  readonly reservationId: string;
  /** 照会フローなど、メールが既知の場合に渡す。未指定なら入力欄を表示する。 */
  readonly prefilledEmail?: string;
  readonly onCancelled?: () => void;
};

/** 予約キャンセル操作（FR-F07）。料率・キャンセル料・返金額を提示する。 */
export function CancelControl({ reservationId, prefilledEmail, onCancelled }: Props) {
  const { services, refresh } = useApp();
  const [email, setEmail] = useState(prefilledEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CancellationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const r = await services.cancel(reservationId, email);
    setBusy(false);
    if (r.ok) {
      setResult(r.value);
      refresh();
      onCancelled?.();
    } else {
      setError(errorMessage(r.error));
    }
  };

  if (result) {
    return (
      <div className="banner ok">
        キャンセルしました（料率 {result.ratePct}%）。キャンセル料 {yen(result.feeJpy)} / 返金{" "}
        {yen(result.refundJpy)}
      </div>
    );
  }

  return (
    <div className="row">
      {prefilledEmail === undefined && (
        <div style={{ flex: 1 }}>
          <label>確認メールアドレス</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="予約時のメール"
          />
        </div>
      )}
      <button onClick={run} disabled={busy || email.trim() === ""}>
        {busy ? "処理中..." : "キャンセルする"}
      </button>
      {error && (
        <div className="banner error" style={{ width: "100%" }}>
          {error}
        </div>
      )}
    </div>
  );
}
