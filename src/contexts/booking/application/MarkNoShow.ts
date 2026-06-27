import type { Clock } from "../../../shared/domain/Clock.js";
import type { ReservationId } from "../../../shared/domain/Id.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { Actor } from "../../../shared/auth.js";
import { requireAdmin } from "../../../shared/auth.js";
import type {
  ConflictError,
  ForbiddenError,
  IllegalState,
  NotFound,
} from "../../../shared/errors.js";
import { notFound } from "../../../shared/errors.js";
import type { ReservationRepository } from "../domain/ports/ReservationRepository.js";

export type MarkNoShowError = ForbiddenError | NotFound | IllegalState | ConflictError;

/** 管理者によるノーショー判定（FR-018）。利用終了経過後の確定予約のみ。 */
export class MarkNoShow {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: Actor,
    input: { readonly reservationId: ReservationId },
  ): Promise<Result<void, MarkNoShowError>> {
    const auth = requireAdmin(actor);
    if (!auth.ok) return auth;

    const reservation = await this.reservations.byId(input.reservationId);
    if (!reservation) return err(notFound("予約が見つかりません"));

    const marked = reservation.markNoShow(this.clock.now());
    if (!marked.ok) return marked;

    const saved = await this.reservations.save(reservation);
    if (!saved.ok) return saved;

    return ok(undefined);
  }
}
