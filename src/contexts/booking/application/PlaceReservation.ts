import type { Clock } from "../../../shared/domain/Clock.js";
import type { EventBus } from "../../../shared/domain/EventBus.js";
import type { CustomerId, SpaceId } from "../../../shared/domain/Id.js";
import type { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type {
  ConflictError,
  NotFound,
  PaymentFailed,
  ValidationError,
} from "../../../shared/errors.js";
import { conflictError, paymentFailed, validationError } from "../../../shared/errors.js";
import { CancellationPolicy } from "../domain/CancellationPolicy.js";
import { Reservation } from "../domain/Reservation.js";
import { SlottedPeriod } from "../domain/SlottedPeriod.js";
import type { ReservationRepository } from "../domain/ports/ReservationRepository.js";
import { ReservationPolicy } from "../domain/services/ReservationPolicy.js";
import type { CustomerDirectoryPort, GuestContactInput } from "./ports/CustomerDirectoryPort.js";
import type { PaymentPort } from "./ports/PaymentPort.js";
import type { SpaceCatalogPort } from "./ports/SpaceCatalogPort.js";

export type PlaceReservationInput = {
  readonly spaceId: SpaceId;
  readonly slotStarts: readonly JstDateTime[];
  /** ゲスト経路で必須。会員経路（customerId 指定時）では不要。 */
  readonly contact?: GuestContactInput;
  /** 会員経路。指定時は contact を使わず customerId で直接紐づける（FR-F07/F08, ADR-F02）。 */
  readonly customerId?: CustomerId;
  /** モック決済の入力。NFR-002 によりドメイン/ログには一切保存しない。 */
  readonly paymentToken?: string;
};

export type PlaceReservationResult = {
  readonly reservationId: string;
  readonly reservationNumber: string;
  readonly priceJpy: number;
};

export type PlaceReservationError = ValidationError | ConflictError | PaymentFailed | NotFound;

/**
 * 予約作成のオーケストレーション（Saga, ADR-007）。
 * Pending 作成＝占有アトミック確保（ADR-003） → 決済 → 成功で Confirmed／失敗で破棄・解放（FR-012/013）。
 */
export class PlaceReservation {
  constructor(
    private readonly catalog: SpaceCatalogPort,
    private readonly customers: CustomerDirectoryPort,
    private readonly reservations: ReservationRepository,
    private readonly payment: PaymentPort,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: PlaceReservationInput,
  ): Promise<Result<PlaceReservationResult, PlaceReservationError>> {
    const now = this.clock.now();

    const catalog = this.catalog.getCatalog(input.spaceId);
    if (!catalog.ok) return catalog;

    // 連続スロット群を構築（連続性検証, FR-014①）。
    const period = SlottedPeriod.of(input.slotStarts, catalog.value.slotMinutes);
    if (!period.ok) return err(validationError(period.error));

    // 予約ルール検証（min/max・営業時間内・公開中・過去日時・上限, FR-014）。
    const constraints = {
      isPublished: catalog.value.isPublished,
      openMinuteOfDay: catalog.value.openMinuteOfDay,
      closeMinuteOfDay: catalog.value.closeMinuteOfDay,
      slotMinutes: catalog.value.slotMinutes,
      minSlots: catalog.value.minSlots,
      maxSlots: catalog.value.maxSlots,
      bookableHorizonDays: catalog.value.bookableHorizonDays,
    };
    const validated = ReservationPolicy.validate(period.value, constraints, now);
    if (!validated.ok) return validated;

    // 確定金額（FR-011）。
    const quote = this.catalog.quote(input.spaceId, input.slotStarts);
    if (!quote.ok) return quote;

    // キャンセルポリシーを確定時スナップショットとして写像（ADR-006）。
    const policy = CancellationPolicy.fromSnapshot(catalog.value.cancellationTiers);
    if (!policy.ok) return err(validationError(policy.error));

    // 顧客を解決: 会員経路は customerId で直接紐づけ、ゲスト経路は連絡先から発行（ADR-F02 / ADR-008）。
    const customerId = this.resolveCustomer(input);
    if (!customerId.ok) return customerId;

    // Pending 作成。
    const reservation = Reservation.pending({
      spaceId: input.spaceId,
      customerId: customerId.value,
      period: period.value,
      price: quote.value,
      policy: policy.value,
      now,
    });

    // 占有をアトミック確保（一段階）。競合は後勝ち拒否（FR-013）。
    const reserved = this.reservations.save(reservation);
    if (!reserved.ok) {
      if (reserved.error.kind === "ConflictError") return err(reserved.error);
      return err(conflictError("予約の確保に失敗しました"));
    }

    // 決済実行（冪等キー = ReservationId, FR-020）。
    const outcome = await this.payment.charge(reservation.id, quote.value);

    if (outcome.kind === "Succeeded") {
      const confirmed = reservation.confirm(now);
      if (!confirmed.ok) {
        // 想定外の状態。占有解放のため abort して終える。
        reservation.abort("Failed", now);
        this.reservations.save(reservation);
        return err(conflictError("予約確定に失敗しました"));
      }
      const persisted = this.reservations.save(reservation);
      if (!persisted.ok) {
        // 確定保存に失敗（稀な状態遷移競合）→ 返金で補償し破棄（設計 §6-1 巻き戻し方針）。
        await this.payment.refund(reservation.id, quote.value);
        return err(conflictError("予約確定に失敗しました"));
      }
      this.bus.publish(confirmed.value);
      return ok({
        reservationId: reservation.id,
        reservationNumber: reservation.reservationNumber.value,
        priceJpy: quote.value.amount,
      });
    }

    // 決済失敗/タイムアウト → 破棄・占有解放（FR-012 シナリオ2/3）。
    const reason = outcome.kind === "TimedOut" ? "TimedOut" : "Failed";
    const aborted = reservation.abort(reason, now);
    this.reservations.save(reservation);
    if (aborted.ok) this.bus.publish(aborted.value);

    const message =
      reason === "TimedOut"
        ? "決済がタイムアウトしました。スロットは解放されました"
        : "決済に失敗しました。スロットは解放されました";
    return err(paymentFailed(reason, message));
  }

  /**
   * 予約者の CustomerId を解決する。
   * 会員経路（customerId 指定）は存在検証のうえ直接紐づけ、ゲスト経路は連絡先からゲスト顧客を発行する。
   */
  private resolveCustomer(input: PlaceReservationInput): Result<CustomerId, ValidationError> {
    if (input.customerId !== undefined) {
      if (!this.customers.contactOf(input.customerId)) {
        return err(validationError("指定された会員が見つかりません"));
      }
      return ok(input.customerId);
    }
    if (input.contact !== undefined) {
      return this.customers.resolveOrIssueGuest(input.contact);
    }
    return err(validationError("予約者情報がありません", ["連絡先または会員IDが必要です"]));
  }
}
