import type { Clock } from "../../../shared/domain/Clock.js";
import type { EventBus } from "../../../shared/domain/EventBus.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { ConflictError, IllegalState, PaymentFailed } from "../../../shared/errors.js";
import { paymentFailed } from "../../../shared/errors.js";
import type { Reservation } from "../domain/Reservation.js";
import type { CancelledBy } from "../domain/events/ReservationCancelled.js";
import type { ReservationRepository } from "../domain/ports/ReservationRepository.js";
import { CancellationFeeCalculator } from "../domain/services/CancellationFeeCalculator.js";
import type { PaymentPort } from "./ports/PaymentPort.js";

export type CancellationResult = {
  readonly feeJpy: number;
  readonly refundJpy: number;
  readonly ratePct: number;
};

export type CancellationError = IllegalState | ConflictError | PaymentFailed;

export type CancellationDeps = {
  readonly reservations: ReservationRepository;
  readonly payment: PaymentPort;
  readonly bus: EventBus;
  readonly clock: Clock;
};

/**
 * キャンセルの共通フロー（FR-015/019/021）。ゲスト/管理者で共有する。
 * 料金算出 → 状態遷移（終端/Completed は IllegalState） → 返金（モック） → 保存（占有解放） → 通知発火。
 * 返金失敗・保存競合時は保存前に打ち切るため、ストアの予約は Confirmed のまま整合を保つ。
 */
export async function runCancellation(
  deps: CancellationDeps,
  reservation: Reservation,
  by: CancelledBy,
  overrideZeroRate: boolean,
): Promise<Result<CancellationResult, CancellationError>> {
  const now = deps.clock.now();
  const remainingHours = reservation.period.start().hoursSince(now);
  const charge = CancellationFeeCalculator.charge(
    reservation.policy,
    remainingHours,
    reservation.confirmedPrice,
    overrideZeroRate,
  );

  const cancelled = reservation.cancel(by, charge.fee, charge.refund, now);
  if (!cancelled.ok) return cancelled;

  if (charge.refund.amount > 0) {
    const refund = await deps.payment.refund(reservation.paymentRef.idempotencyKey, charge.refund);
    if (refund.kind === "Failed") {
      return err(paymentFailed("Failed", `返金に失敗しました: ${refund.reason}`));
    }
  }

  const saved = await deps.reservations.save(reservation);
  if (!saved.ok) return saved;

  deps.bus.publish(cancelled.value);
  return ok({ feeJpy: charge.fee.amount, refundJpy: charge.refund.amount, ratePct: charge.ratePct });
}
