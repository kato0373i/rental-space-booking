import { CustomerId, ReservationId, SpaceId } from "../../../shared/domain/Id.js";
import { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import { Money } from "../../../shared/domain/Money.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok, unwrap } from "../../../shared/domain/Result.js";
import type { IllegalState } from "../../../shared/errors.js";
import { illegalState } from "../../../shared/errors.js";
import { CancellationPolicy, type CancellationTier } from "./CancellationPolicy.js";
import { PaymentRef } from "./PaymentRef.js";
import { ReservationNumber } from "./ReservationNumber.js";
import type { ReservationStatus } from "./ReservationStatus.js";
import { SlottedPeriod } from "./SlottedPeriod.js";
import {
  RESERVATION_CONFIRMED,
  type ReservationConfirmed,
} from "./events/ReservationConfirmed.js";
import {
  RESERVATION_CANCELLED,
  type CancelledBy,
  type ReservationCancelled,
} from "./events/ReservationCancelled.js";
import {
  RESERVATION_ABORTED,
  type ReservationAborted,
} from "./events/ReservationAborted.js";

/** 永続化用のスナップショット（§4 reservation テーブル相当。インメモリ実装が鏡写しにする）。 */
export type ReservationSnapshot = {
  readonly id: string;
  readonly reservationNumber: string;
  readonly spaceId: string;
  readonly customerId: string;
  readonly slotStartsEpoch: readonly number[];
  readonly slotMinutes: number;
  readonly status: ReservationStatus;
  readonly confirmedPriceJpy: number;
  readonly policyTiers: readonly CancellationTier[];
  readonly paymentIdemKey: string;
  readonly version: number;
  readonly createdAtEpoch: number;
  readonly confirmedAtEpoch: number | null;
  readonly cancelledBy: CancelledBy | null;
};

export type PendingProps = {
  readonly spaceId: SpaceId;
  readonly customerId: CustomerId;
  readonly period: SlottedPeriod;
  readonly price: Money;
  readonly policy: CancellationPolicy;
  readonly now: JstDateTime;
  readonly id?: ReservationId;
  readonly reservationNumber?: ReservationNumber;
};

/**
 * 予約集約ルート（コアドメイン）。状態遷移と不変条件を担う。
 * 確定金額・キャンセルポリシーは Pending 作成時にスナップショット保持し、後続のスペース改定の影響を受けない（ADR-006）。
 * 在庫（占有）の一意性はリポジトリが強制し、本集約は「占有するのは Pending/Confirmed」というルールのみを表現する（ADR-002）。
 */
export class Reservation {
  private constructor(
    readonly id: ReservationId,
    readonly reservationNumber: ReservationNumber,
    readonly spaceId: SpaceId,
    readonly customerId: CustomerId,
    readonly period: SlottedPeriod,
    readonly confirmedPrice: Money,
    readonly policy: CancellationPolicy,
    readonly paymentRef: PaymentRef,
    private statusValue: ReservationStatus,
    private versionValue: number,
    readonly createdAt: JstDateTime,
    private confirmedAtValue: JstDateTime | null,
    private cancelledByValue: CancelledBy | null,
  ) {}

  /** Pending で予約を作成する（占有確保はリポジトリ save 時に一段階で行う, ADR-003）。 */
  static pending(props: PendingProps): Reservation {
    const id = props.id ?? ReservationId.generate();
    const number = props.reservationNumber ?? ReservationNumber.generate();
    return new Reservation(
      id,
      number,
      props.spaceId,
      props.customerId,
      props.period,
      props.price,
      props.policy,
      PaymentRef.forReservation(id),
      "Pending",
      1,
      props.now,
      null,
      null,
    );
  }

  get status(): ReservationStatus {
    return this.statusValue;
  }
  get version(): number {
    return this.versionValue;
  }
  get confirmedAt(): JstDateTime | null {
    return this.confirmedAtValue;
  }
  get cancelledBy(): CancelledBy | null {
    return this.cancelledByValue;
  }

  /** 導出状態 Completed: Confirmed かつ利用終了時刻を経過（ADR-004, FR-017）。 */
  isCompletedAt(now: JstDateTime): boolean {
    return this.statusValue === "Confirmed" && now.isAfter(this.period.endExclusive());
  }

  /** キャンセル可能か: Confirmed かつ利用終了前（FR-015）。 */
  isCancellableAt(now: JstDateTime): boolean {
    return this.statusValue === "Confirmed" && now.isAtOrBefore(this.period.endExclusive());
  }

  /** 決済成功 → Confirmed（FR-012）。 */
  confirm(at: JstDateTime): Result<ReservationConfirmed, IllegalState> {
    if (this.statusValue !== "Pending") {
      return err(illegalState("確定できるのは Pending の予約のみです"));
    }
    this.statusValue = "Confirmed";
    this.confirmedAtValue = at;
    this.versionValue++;
    return ok({
      type: RESERVATION_CONFIRMED,
      occurredAt: at,
      reservationId: this.id,
      reservationNumber: this.reservationNumber.value,
      customerId: this.customerId,
      spaceId: this.spaceId,
      startAt: this.period.start(),
      endAt: this.period.endExclusive(),
      price: this.confirmedPrice,
    });
  }

  /** 決済失敗/タイムアウト → Aborted（占有はリポジトリが解放, ADR-005）。 */
  abort(reason: "Failed" | "TimedOut", at: JstDateTime): Result<ReservationAborted, IllegalState> {
    if (this.statusValue !== "Pending") {
      return err(illegalState("破棄できるのは Pending の予約のみです"));
    }
    this.statusValue = "Aborted";
    this.versionValue++;
    return ok({
      type: RESERVATION_ABORTED,
      occurredAt: at,
      reservationId: this.id,
      reservationNumber: this.reservationNumber.value,
      reason,
    });
  }

  /**
   * キャンセル（FR-015/019）。料金・返金額は CancellationFeeCalculator が算出して渡す。
   * 終端状態・Completed には不可（IllegalState）。
   */
  cancel(
    by: CancelledBy,
    feeAmount: Money,
    refundAmount: Money,
    at: JstDateTime,
  ): Result<ReservationCancelled, IllegalState> {
    if (this.statusValue !== "Confirmed") {
      return err(illegalState("この予約はキャンセルできません"));
    }
    if (!this.isCancellableAt(at)) {
      return err(illegalState("利用終了後の予約はキャンセルできません"));
    }
    this.statusValue = "Cancelled";
    this.cancelledByValue = by;
    this.versionValue++;
    return ok({
      type: RESERVATION_CANCELLED,
      occurredAt: at,
      reservationId: this.id,
      reservationNumber: this.reservationNumber.value,
      customerId: this.customerId,
      spaceId: this.spaceId,
      startAt: this.period.start(),
      feeAmount,
      refundAmount,
      cancelledBy: by,
    });
  }

  /** 管理者によるノーショー判定（FR-018）。利用終了経過後の Confirmed のみ。 */
  markNoShow(at: JstDateTime): Result<void, IllegalState> {
    if (this.statusValue !== "Confirmed") {
      return err(illegalState("ノーショーにできるのは確定予約のみです"));
    }
    if (!at.isAfter(this.period.endExclusive())) {
      return err(illegalState("利用終了前の予約はノーショーにできません"));
    }
    this.statusValue = "NoShow";
    this.versionValue++;
    return ok(undefined);
  }

  toSnapshot(): ReservationSnapshot {
    return {
      id: this.id,
      reservationNumber: this.reservationNumber.value,
      spaceId: this.spaceId,
      customerId: this.customerId,
      slotStartsEpoch: this.period.slotStarts().map((s) => s.epochMillis),
      slotMinutes: this.period.slotMinutes,
      status: this.statusValue,
      confirmedPriceJpy: this.confirmedPrice.amount,
      policyTiers: this.policy.toSnapshot(),
      paymentIdemKey: this.paymentRef.idempotencyKey,
      version: this.versionValue,
      createdAtEpoch: this.createdAt.epochMillis,
      confirmedAtEpoch: this.confirmedAtValue?.epochMillis ?? null,
      cancelledBy: this.cancelledByValue,
    };
  }

  /** スナップショットから集約を再構成する（リポジトリ読み出し時）。 */
  static restore(s: ReservationSnapshot): Reservation {
    const period = unwrap(
      SlottedPeriod.of(
        s.slotStartsEpoch.map((e) => JstDateTime.fromEpochMillis(e)),
        s.slotMinutes,
      ),
    );
    const policy = unwrap(CancellationPolicy.fromSnapshot(s.policyTiers));
    return new Reservation(
      ReservationId.of(s.id),
      ReservationNumber.of(s.reservationNumber),
      SpaceId.of(s.spaceId),
      CustomerId.of(s.customerId),
      period,
      Money.ofUnsafe(s.confirmedPriceJpy),
      policy,
      PaymentRef.forReservation(s.paymentIdemKey),
      s.status,
      s.version,
      JstDateTime.fromEpochMillis(s.createdAtEpoch),
      s.confirmedAtEpoch === null ? null : JstDateTime.fromEpochMillis(s.confirmedAtEpoch),
      s.cancelledBy,
    );
  }
}
