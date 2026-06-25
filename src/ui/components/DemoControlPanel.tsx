import { useState } from "react";
import type { PaymentBehavior } from "../../composition/webFacade.js";
import { useApp } from "../app/AppContext.js";

/** デモ操作: 決済挙動の切替・リマインド送信（FR-F11）。 */
export function DemoControlPanel() {
  const { services, refresh } = useApp();
  const [behavior, setBehavior] = useState<PaymentBehavior>("Succeed");
  const [sent, setSent] = useState<number | null>(null);

  const onBehavior = (value: PaymentBehavior) => {
    setBehavior(value);
    services.setPaymentBehavior(value);
  };

  const onReminders = () => {
    setSent(services.triggerReminders());
    refresh();
  };

  return (
    <section className="panel">
      <h2>デモ操作</h2>
      <label htmlFor="pay">決済モックの挙動</label>
      <select
        id="pay"
        value={behavior}
        onChange={(e) => onBehavior(e.target.value as PaymentBehavior)}
      >
        <option value="Succeed">成功</option>
        <option value="Fail">失敗</option>
        <option value="Timeout">タイムアウト</option>
      </select>
      <p className="muted" style={{ marginTop: "0.75rem" }}>
        利用開始24時間以内の確定予約にリマインドを送信します。
      </p>
      <button onClick={onReminders}>リマインド送信</button>
      {sent !== null && <p className="muted">送信 {sent} 件</p>}
    </section>
  );
}
