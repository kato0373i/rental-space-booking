import type { ReservationId } from "../../../../shared/domain/Id.js";
import type { DomainEvent } from "../../../../shared/domain/DomainEvent.js";

export const RESERVATION_ABORTED = "ReservationAborted" as const;

/** 決済失敗/タイムアウトで Pending を破棄したときに発生（観測/ログのみ, ADR-005）。 */
export interface ReservationAborted extends DomainEvent {
  readonly type: typeof RESERVATION_ABORTED;
  readonly reservationId: ReservationId;
  readonly reservationNumber: string;
  readonly reason: "Failed" | "TimedOut";
}
