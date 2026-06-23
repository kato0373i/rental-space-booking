import type { Clock } from "../../../shared/domain/Clock.js";
import type { EventBus } from "../../../shared/domain/EventBus.js";
import type { ReservationId } from "../../../shared/domain/Id.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err } from "../../../shared/domain/Result.js";
import type { Actor } from "../../../shared/auth.js";
import { requireAdmin } from "../../../shared/auth.js";
import type { ForbiddenError, NotFound } from "../../../shared/errors.js";
import { notFound } from "../../../shared/errors.js";
import type { ReservationRepository } from "../domain/ports/ReservationRepository.js";
import {
  runCancellation,
  type CancellationError,
  type CancellationResult,
} from "./cancellationFlow.js";
import type { PaymentPort } from "./ports/PaymentPort.js";

export type ForceCancelInput = {
  readonly reservationId: ReservationId;
  /** 管理者のみ、キャンセル料率を0%に上書きできる（U-06）。 */
  readonly overrideZeroRate?: boolean;
};

/** 管理者による強制キャンセル（FR-019）。キャンセル料・返金ポリシーに従う（0%上書き可）。 */
export class ForceCancelReservation {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly payment: PaymentPort,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: Actor,
    input: ForceCancelInput,
  ): Promise<Result<CancellationResult, CancellationError | NotFound | ForbiddenError>> {
    const auth = requireAdmin(actor);
    if (!auth.ok) return auth;

    const reservation = this.reservations.byId(input.reservationId);
    if (!reservation) return err(notFound("予約が見つかりません"));

    return runCancellation(
      {
        reservations: this.reservations,
        payment: this.payment,
        bus: this.bus,
        clock: this.clock,
      },
      reservation,
      "Admin",
      input.overrideZeroRate ?? false,
    );
  }
}
