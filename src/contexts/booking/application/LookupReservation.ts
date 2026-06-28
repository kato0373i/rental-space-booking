import type { Clock } from "../../../shared/domain/Clock.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { NotFound } from "../../../shared/errors.js";
import { notFound } from "../../../shared/errors.js";
import type { ReservationRepository } from "../domain/ports/ReservationRepository.js";
import type { CustomerDirectoryPort } from "./ports/CustomerDirectoryPort.js";
import { toReservationView, type ReservationView } from "./ReservationView.js";

export type LookupInput = {
  readonly reservationNumber: string;
  readonly email: string;
};

/**
 * ゲスト予約照会（FR-016）。予約番号＋メールで個別照会。
 * 番号不在・メール不一致のいずれも同じ NotFound を返し、存在を推測させない。
 */
export class LookupReservation {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly customers: CustomerDirectoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(input: LookupInput): Promise<Result<ReservationView, NotFound>> {
    const reservation = await this.reservations.byNumber(input.reservationNumber);
    if (!reservation) return err(notFound("該当する予約が見つかりません"));
    if (!(await this.customers.emailMatches(reservation.customerId, input.email))) {
      return err(notFound("該当する予約が見つかりません"));
    }
    return ok(toReservationView(reservation, this.clock.now()));
  }
}
