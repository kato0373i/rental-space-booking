import type { Clock } from "../../../shared/domain/Clock.js";
import type { CustomerId } from "../../../shared/domain/Id.js";
import type { ReservationRepository } from "../domain/ports/ReservationRepository.js";
import { toReservationView, type ReservationView } from "./ReservationView.js";

/** 会員の予約履歴一覧（FR-016）。CustomerId で束ねた予約を新しい順に返す。 */
export class ListMyReservations {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly clock: Clock,
  ) {}

  execute(memberId: CustomerId): ReservationView[] {
    const now = this.clock.now();
    return this.reservations
      .byCustomer(memberId)
      .sort((a, b) => b.createdAt.epochMillis - a.createdAt.epochMillis)
      .map((r) => toReservationView(r, now));
  }
}
