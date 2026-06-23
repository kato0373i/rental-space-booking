import type { Clock } from "../../../shared/domain/Clock.js";
import type { EventBus } from "../../../shared/domain/EventBus.js";
import type { ReservationId } from "../../../shared/domain/Id.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err } from "../../../shared/domain/Result.js";
import type { NotFound } from "../../../shared/errors.js";
import { notFound } from "../../../shared/errors.js";
import type { ReservationRepository } from "../domain/ports/ReservationRepository.js";
import {
  runCancellation,
  type CancellationError,
  type CancellationResult,
} from "./cancellationFlow.js";
import type { CustomerDirectoryPort } from "./ports/CustomerDirectoryPort.js";
import type { PaymentPort } from "./ports/PaymentPort.js";

export type CancelReservationInput = {
  readonly reservationId: ReservationId;
  readonly email: string;
};

/**
 * ゲストによる予約キャンセル（FR-015）。
 * 予約番号ではなく ID＋メール照合で本人確認する。不一致は NotFound（存在を推測させない）。
 */
export class CancelReservation {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly payment: PaymentPort,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    private readonly customers: CustomerDirectoryPort,
  ) {}

  async execute(
    input: CancelReservationInput,
  ): Promise<Result<CancellationResult, CancellationError | NotFound>> {
    const reservation = this.reservations.byId(input.reservationId);
    if (!reservation) return err(notFound("該当する予約が見つかりません"));
    if (!this.customers.emailMatches(reservation.customerId, input.email)) {
      return err(notFound("該当する予約が見つかりません"));
    }
    return runCancellation(
      {
        reservations: this.reservations,
        payment: this.payment,
        bus: this.bus,
        clock: this.clock,
      },
      reservation,
      "Guest",
      false,
    );
  }
}
