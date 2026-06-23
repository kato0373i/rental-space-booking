import type { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import type { Reservation } from "../domain/Reservation.js";
import type { ReservationStatus } from "../domain/ReservationStatus.js";

/** 参照時に導出される状態を含む（Completed は永続状態ではない, ADR-004）。 */
export type DerivedStatus = ReservationStatus | "Completed";

export type ReservationView = {
  readonly reservationId: string;
  readonly reservationNumber: string;
  readonly spaceId: string;
  readonly customerId: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly status: DerivedStatus;
  readonly priceJpy: number;
};

export const toReservationView = (r: Reservation, now: JstDateTime): ReservationView => ({
  reservationId: r.id,
  reservationNumber: r.reservationNumber.value,
  spaceId: r.spaceId,
  customerId: r.customerId,
  startAt: r.period.start().toIsoJst(),
  endAt: r.period.endExclusive().toIsoJst(),
  status: r.isCompletedAt(now) ? "Completed" : r.status,
  priceJpy: r.confirmedPrice.amount,
});
