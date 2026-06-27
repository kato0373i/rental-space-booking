import { isBlocksError } from "@aws-blocks/core";
import { DatabaseErrors, sql, type SqlQuery, type Transaction } from "@aws-blocks/blocks";
import type { CustomerId, ReservationId, SpaceId } from "../../../shared/domain/Id.js";
import { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { ConflictError, IllegalState } from "../../../shared/errors.js";
import { conflictError, illegalState } from "../../../shared/errors.js";
import type { CancellationTier } from "../domain/CancellationPolicy.js";
import { Reservation, type ReservationSnapshot } from "../domain/Reservation.js";
import type { CancelledBy } from "../domain/events/ReservationCancelled.js";
import { isOccupying, type ReservationStatus } from "../domain/ReservationStatus.js";
import type {
  Page,
  Paging,
  ReservationListFilter,
  ReservationRepository,
} from "../domain/ports/ReservationRepository.js";

/**
 * `@aws-blocks/bb-data` の Database が提供する最小の SQL 実行面。
 * Database 構築（Scope 依存）に結合せず、テストでは PGlite バックエンドの同等実装を渡せる。
 */
export interface SqlDatabase {
  query<T>(query: SqlQuery): Promise<T[]>;
  queryOne<T>(query: SqlQuery): Promise<T | null>;
  execute(query: SqlQuery): Promise<{ rowCount: number }>;
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

/** reservations 行の生形（BIGINT は driver により string で返り得るため number|string で受ける）。 */
type ReservationRow = {
  readonly id: string;
  readonly reservation_number: string;
  readonly space_id: string;
  readonly customer_id: string;
  readonly slot_starts_epoch: string;
  readonly slot_minutes: number | string;
  readonly status: string;
  readonly confirmed_price_jpy: number | string;
  readonly policy_tiers: string;
  readonly payment_idem_key: string;
  readonly version: number | string;
  readonly created_at_epoch: number | string;
  readonly confirmed_at_epoch: number | string | null;
  readonly cancelled_by: string | null;
};

const toSnapshot = (r: ReservationRow): ReservationSnapshot => ({
  id: r.id,
  reservationNumber: r.reservation_number,
  spaceId: r.space_id,
  customerId: r.customer_id,
  slotStartsEpoch: JSON.parse(r.slot_starts_epoch) as number[],
  slotMinutes: Number(r.slot_minutes),
  status: r.status as ReservationStatus,
  confirmedPriceJpy: Number(r.confirmed_price_jpy),
  policyTiers: JSON.parse(r.policy_tiers) as CancellationTier[],
  paymentIdemKey: r.payment_idem_key,
  version: Number(r.version),
  createdAtEpoch: Number(r.created_at_epoch),
  confirmedAtEpoch: r.confirmed_at_epoch === null ? null : Number(r.confirmed_at_epoch),
  cancelledBy: r.cancelled_by as CancelledBy | null,
});

const restore = (r: ReservationRow): Reservation => Reservation.restore(toSnapshot(r));

/**
 * AWS Blocks Database（Postgres / ローカルは PGlite）による予約リポジトリ実装。
 * 占有一意性は reservation_slots の複合PKで物理強制し、確保＋予約更新を単一トランザクションで原子化する
 * （設計 ADR-AB02/AB04）。ポート契約はインメモリ実装と同値（契約テストで担保）。
 */
export class BlocksReservationRepository implements ReservationRepository {
  constructor(private readonly db: SqlDatabase) {}

  async save(reservation: Reservation): Promise<Result<void, ConflictError | IllegalState>> {
    const snap = reservation.toSnapshot();
    const wantsOccupancy = isOccupying(snap.status);
    try {
      const outcome = await this.db.transaction(async (tx) => {
        // 楽観ロック: 既存より version が進んでいなければ状態遷移競合。
        const existing = await tx.queryOne<{ version: number | string }>(
          sql`SELECT version FROM reservations WHERE id = ${snap.id}`,
        );
        if (existing && snap.version <= Number(existing.version)) return "stale" as const;

        // 予約行を先に UPSERT する（reservation_slots の FK が参照するため）。
        // 占有競合で後段がロールバックされれば、この UPSERT も巻き戻る（一段階アトミック, ADR-AB04）。
        await tx.execute(
          sql`INSERT INTO reservations (
                id, reservation_number, space_id, customer_id, slot_starts_epoch, first_slot_epoch,
                slot_minutes, status, confirmed_price_jpy, policy_tiers, payment_idem_key, version,
                created_at_epoch, confirmed_at_epoch, cancelled_by
              ) VALUES (
                ${snap.id}, ${snap.reservationNumber}, ${snap.spaceId}, ${snap.customerId},
                ${JSON.stringify(snap.slotStartsEpoch)}, ${snap.slotStartsEpoch[0] ?? 0},
                ${snap.slotMinutes}, ${snap.status}, ${snap.confirmedPriceJpy},
                ${JSON.stringify(snap.policyTiers)}, ${snap.paymentIdemKey}, ${snap.version},
                ${snap.createdAtEpoch}, ${snap.confirmedAtEpoch}, ${snap.cancelledBy}
              )
              ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status,
                slot_starts_epoch = EXCLUDED.slot_starts_epoch,
                first_slot_epoch = EXCLUDED.first_slot_epoch,
                confirmed_price_jpy = EXCLUDED.confirmed_price_jpy,
                policy_tiers = EXCLUDED.policy_tiers,
                payment_idem_key = EXCLUDED.payment_idem_key,
                version = EXCLUDED.version,
                confirmed_at_epoch = EXCLUDED.confirmed_at_epoch,
                cancelled_by = EXCLUDED.cancelled_by`,
        );

        // この予約の占有を一旦解放し、必要なら再確保する。
        await tx.execute(sql`DELETE FROM reservation_slots WHERE reservation_id = ${snap.id}`);
        if (wantsOccupancy) {
          for (const epoch of snap.slotStartsEpoch) {
            // 既に他予約が占有していれば複合PK違反 → UniqueConstraintViolation（後勝ち拒否, FR-013）。
            await tx.execute(
              sql`INSERT INTO reservation_slots (space_id, slot_start_epoch, reservation_id)
                  VALUES (${snap.spaceId}, ${epoch}, ${snap.id})`,
            );
          }
        }
        return "ok" as const;
      });
      if (outcome === "stale") {
        return err(illegalState("予約が他の操作で更新されています（競合）"));
      }
      return ok(undefined);
    } catch (e) {
      if (isBlocksError(e, DatabaseErrors.UniqueConstraintViolation)) {
        return err(conflictError("すでに予約されました"));
      }
      throw e;
    }
  }

  async byId(id: ReservationId): Promise<Reservation | undefined> {
    const row = await this.db.queryOne<ReservationRow>(
      sql`SELECT * FROM reservations WHERE id = ${id}`,
    );
    return row ? restore(row) : undefined;
  }

  async byNumber(reservationNumber: string): Promise<Reservation | undefined> {
    const row = await this.db.queryOne<ReservationRow>(
      sql`SELECT * FROM reservations WHERE reservation_number = ${reservationNumber}`,
    );
    return row ? restore(row) : undefined;
  }

  async byCustomer(customerId: CustomerId): Promise<Reservation[]> {
    const rows = await this.db.query<ReservationRow>(
      sql`SELECT * FROM reservations WHERE customer_id = ${customerId}`,
    );
    return rows.map(restore);
  }

  async occupiedSlots(
    spaceId: SpaceId,
    fromInclusive: JstDateTime,
    toExclusive: JstDateTime,
  ): Promise<JstDateTime[]> {
    const rows = await this.db.query<{ slot_start_epoch: number | string }>(
      sql`SELECT slot_start_epoch FROM reservation_slots
          WHERE space_id = ${spaceId}
            AND slot_start_epoch >= ${fromInclusive.epochMillis}
            AND slot_start_epoch < ${toExclusive.epochMillis}`,
    );
    return rows.map((r) => JstDateTime.fromEpochMillis(Number(r.slot_start_epoch)));
  }

  async list(filter: ReservationListFilter, paging: Paging): Promise<Page<Reservation>> {
    // null フィルタは型付き NULL で素通しする。`sql` はフラグメント合成不可のため、
    // WHERE 条件は count / select 双方に同じ形でインラインする。
    const status = filter.status ?? null;
    const spaceId = filter.spaceId ?? null;
    const from = filter.fromInclusive?.epochMillis ?? null;
    const to = filter.toExclusive?.epochMillis ?? null;
    const offset = (paging.page - 1) * paging.size;

    const totalRow = await this.db.queryOne<{ total: number | string }>(
      sql`SELECT COUNT(*)::int AS total FROM reservations
          WHERE (${status}::text IS NULL OR status = ${status})
            AND (${spaceId}::text IS NULL OR space_id = ${spaceId})
            AND (${from}::bigint IS NULL OR first_slot_epoch >= ${from})
            AND (${to}::bigint IS NULL OR first_slot_epoch < ${to})`,
    );
    const rows = await this.db.query<ReservationRow>(
      sql`SELECT * FROM reservations
          WHERE (${status}::text IS NULL OR status = ${status})
            AND (${spaceId}::text IS NULL OR space_id = ${spaceId})
            AND (${from}::bigint IS NULL OR first_slot_epoch >= ${from})
            AND (${to}::bigint IS NULL OR first_slot_epoch < ${to})
          ORDER BY created_at_epoch DESC
          LIMIT ${paging.size} OFFSET ${offset}`,
    );

    return {
      items: rows.map(restore),
      total: totalRow ? Number(totalRow.total) : 0,
      page: paging.page,
      size: paging.size,
    };
  }

  async confirmedStartingBetween(
    fromInclusive: JstDateTime,
    toExclusive: JstDateTime,
  ): Promise<Reservation[]> {
    const rows = await this.db.query<ReservationRow>(
      sql`SELECT * FROM reservations
          WHERE status = 'Confirmed'
            AND first_slot_epoch >= ${fromInclusive.epochMillis}
            AND first_slot_epoch < ${toExclusive.epochMillis}`,
    );
    return rows.map(restore);
  }
}
