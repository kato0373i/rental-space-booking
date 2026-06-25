/** 金額（円）の表示整形。 */
export const yen = (amount: number): string => `¥${amount.toLocaleString("ja-JP")}`;

/** ISO(JST) "YYYY-MM-DDTHH:mm+09:00" を "YYYY-MM-DD HH:mm" に整形。 */
export const fmtDateTime = (iso: string): string => iso.slice(0, 16).replace("T", " ");

/** エポックms（JST instant）を JST 壁時計 "YYYY-MM-DD HH:mm" に整形（ブラウザTZ非依存）。 */
export const fmtEpochJst = (epochMillis: number): string => {
  const d = new Date(epochMillis + 9 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

/** 予約状態の日本語ラベル（導出 Completed を含む）。 */
export const statusLabel = (status: string): string => {
  switch (status) {
    case "Pending":
      return "処理中";
    case "Confirmed":
      return "確定";
    case "Completed":
      return "利用完了";
    case "Cancelled":
      return "キャンセル済";
    case "NoShow":
      return "ノーショー";
    case "Aborted":
      return "不成立";
    default:
      return status;
  }
};
