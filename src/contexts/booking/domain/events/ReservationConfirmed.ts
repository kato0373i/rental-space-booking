import type { CustomerId, ReservationId, SpaceId } from "../../../../shared/domain/Id.js";
import type { DomainEvent } from "../../../../shared/domain/DomainEvent.js";
import type { JstDateTime } from "../../../../shared/domain/JstDateTime.js";
import type { Money } from "../../../../shared/domain/Money.js";

export const RESERVATION_CONFIRMED = "ReservationConfirmed" as const;

/** 決済成功で Confirmed 遷移したときに発生（FR-030 確定通知／リマインド登録の契機）。 */
export interface ReservationConfirmed extends DomainEvent {
  readonly type: typeof RESERVATION_CONFIRMED;
  readonly reservationId: ReservationId;
  readonly reservationNumber: string;
  readonly customerId: CustomerId;
  readonly spaceId: SpaceId;
  readonly startAt: JstDateTime;
  readonly endAt: JstDateTime;
  readonly price: Money;
}
