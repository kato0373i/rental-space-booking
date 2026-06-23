import type { CustomerId, ReservationId, SpaceId } from "../../../../shared/domain/Id.js";
import type { DomainEvent } from "../../../../shared/domain/DomainEvent.js";
import type { JstDateTime } from "../../../../shared/domain/JstDateTime.js";

export const RESERVATION_REMINDER_DUE = "ReservationReminderDue" as const;

/** 利用開始24時間前のトリガ発火時に発生（FR-032 リマインド通知）。 */
export interface ReservationReminderDue extends DomainEvent {
  readonly type: typeof RESERVATION_REMINDER_DUE;
  readonly reservationId: ReservationId;
  readonly reservationNumber: string;
  readonly customerId: CustomerId;
  readonly spaceId: SpaceId;
  readonly startAt: JstDateTime;
}
