/**
 * 予約の永続状態（設計書 §3 状態モデル）。
 * Completed は永続させず「Confirmed かつ利用終了経過」で参照時に導出する（ADR-004）。
 */
export type ReservationStatus = "Pending" | "Confirmed" | "Cancelled" | "NoShow" | "Aborted";

/** スロットを占有する状態（Pending/Confirmed）。Cancelled/Aborted で解放（§7）。 */
export const isOccupying = (status: ReservationStatus): boolean =>
  status === "Pending" || status === "Confirmed";

/** 終端状態（編集・キャンセル不可）。 */
export const isTerminal = (status: ReservationStatus): boolean =>
  status === "Cancelled" || status === "NoShow" || status === "Aborted";
