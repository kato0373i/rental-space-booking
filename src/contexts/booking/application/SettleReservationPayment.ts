import type { Clock } from "../../../shared/domain/Clock.js";
import type { EventBus } from "../../../shared/domain/EventBus.js";
import type { ReservationId } from "../../../shared/domain/Id.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { IllegalState, NotFound } from "../../../shared/errors.js";
import { illegalState, notFound } from "../../../shared/errors.js";
import type { ReservationStatus } from "../domain/ReservationStatus.js";
import type { ReservationRepository } from "../domain/ports/ReservationRepository.js";
import type { PaymentOutcome } from "./ports/PaymentPort.js";

/** 決済結果の確定通知（Webhook 等の非同期決着で予約に反映する単位, ADR-AB10）。 */
export type PaymentSettlement = {
  readonly reservationId: ReservationId;
  readonly outcome: PaymentOutcome;
};

export type SettlementResult = { readonly status: ReservationStatus };

/**
 * 決済結果を予約に反映する（Webhook → Background jobs オーケストレーションの終端, #14 / ADR-AB10）。
 *
 * 冪等: Pending の予約のみ遷移させ、すでに決着済み（Confirmed/Aborted/…）なら現状をそのまま返す。
 * これにより Webhook の at-least-once 再送・同期確定（PlaceReservation）との二重適用を安全に吸収する。
 * - 成功: Pending → Confirmed（ReservationConfirmed を発火）
 * - 失敗/タイムアウト: Pending → Aborted（占有解放, ReservationAborted を発火）
 */
export class SettleReservationPayment {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(
    settlement: PaymentSettlement,
  ): Promise<Result<SettlementResult, NotFound | IllegalState>> {
    const reservation = await this.reservations.byId(settlement.reservationId);
    if (!reservation) {
      // Webhook が予約永続化より先着する競合もあり得る。未検出は再試行対象として NotFound を返す。
      return err(notFound("対象の予約が見つかりません"));
    }
    // すでに決着済みなら何もしない（冪等。同期確定や Webhook 再送との二重適用を防ぐ）。
    if (reservation.status !== "Pending") {
      return ok({ status: reservation.status });
    }

    const now = this.clock.now();
    if (settlement.outcome.kind === "Succeeded") {
      const confirmed = reservation.confirm(now);
      if (!confirmed.ok) return err(confirmed.error);
      const saved = await this.reservations.save(reservation);
      if (!saved.ok) return err(illegalState("予約確定の保存に失敗しました"));
      this.bus.publish(confirmed.value);
      return ok({ status: "Confirmed" });
    }

    const reason = settlement.outcome.kind === "TimedOut" ? "TimedOut" : "Failed";
    const aborted = reservation.abort(reason, now);
    if (!aborted.ok) return err(aborted.error);
    const saved = await this.reservations.save(reservation);
    if (!saved.ok) return err(illegalState("予約破棄の保存に失敗しました"));
    this.bus.publish(aborted.value);
    return ok({ status: "Aborted" });
  }
}
