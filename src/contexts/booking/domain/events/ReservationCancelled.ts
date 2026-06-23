import type { CustomerId, ReservationId, SpaceId } from "../../../../shared/domain/Id.js";
import type { DomainEvent } from "../../../../shared/domain/DomainEvent.js";
import type { JstDateTime } from "../../../../shared/domain/JstDateTime.js";
import type { Money } from "../../../../shared/domain/Money.js";

export const RESERVATION_CANCELLED = "ReservationCancelled" as const;

export type CancelledBy = "Guest" | "Admin";

/** キャンセル成立時に発生（FR-031 キャンセル通知）。 */
export interface ReservationCancelled extends DomainEvent {
  readonly type: typeof RESERVATION_CANCELLED;
  readonly reservationId: ReservationId;
  readonly reservationNumber: string;
  readonly customerId: CustomerId;
  readonly spaceId: SpaceId;
  readonly startAt: JstDateTime;
  readonly feeAmount: Money;
  readonly refundAmount: Money;
  readonly cancelledBy: CancelledBy;
}
