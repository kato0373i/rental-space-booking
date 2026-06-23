import type { CustomerId, ReservationId, SpaceId } from "../../../../shared/domain/Id.js";
import type { JstDateTime } from "../../../../shared/domain/JstDateTime.js";
import type { Result } from "../../../../shared/domain/Result.js";
import type { ConflictError, IllegalState } from "../../../../shared/errors.js";
import type { Reservation } from "../Reservation.js";
import type { ReservationStatus } from "../ReservationStatus.js";

export type ReservationListFilter = {
  readonly status?: ReservationStatus;
  readonly spaceId?: SpaceId;
};

export type Paging = { readonly page: number; readonly size: number };

export type Page<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly size: number;
};

/**
 * 予約集約の永続化ポート（ドメインが所有）。
 * 占有一意性（ダブルブッキング防止, FR-013）の強制は実装（インフラ）の責務。
 * save は Pending/Confirmed の占有を一段階でアトミック確保し、競合時は ConflictError を返す（ADR-002/003）。
 * Cancelled/Aborted への遷移を保存すると占有を解放する。
 * version による楽観ロックで状態遷移競合（管理者強制 vs ゲスト）を IllegalState として検出する。
 */
export interface ReservationRepository {
  save(reservation: Reservation): Result<void, ConflictError | IllegalState>;
  byId(id: ReservationId): Reservation | undefined;
  byNumber(reservationNumber: string): Reservation | undefined;
  byCustomer(customerId: CustomerId): Reservation[];
  /** 指定スペース・期間で Pending/Confirmed が占有するスロット開始時刻（FR-010）。 */
  occupiedSlots(
    spaceId: SpaceId,
    fromInclusive: JstDateTime,
    toExclusive: JstDateTime,
  ): JstDateTime[];
  /** 管理者向け横断一覧（FR-019, オフセットページング）。 */
  list(filter: ReservationListFilter, paging: Paging): Page<Reservation>;
  /** 利用開始が指定期間内の Confirmed 予約（FR-032 リマインド）。 */
  confirmedStartingBetween(fromInclusive: JstDateTime, toExclusive: JstDateTime): Reservation[];
}
