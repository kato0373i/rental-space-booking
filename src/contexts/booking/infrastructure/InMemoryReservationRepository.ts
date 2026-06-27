import type { CustomerId, ReservationId, SpaceId } from "../../../shared/domain/Id.js";
import { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { ConflictError, IllegalState } from "../../../shared/errors.js";
import { conflictError, illegalState } from "../../../shared/errors.js";
import { Reservation, type ReservationSnapshot } from "../domain/Reservation.js";
import { isOccupying } from "../domain/ReservationStatus.js";
import type {
  Page,
  ReservationListFilter,
  ReservationRepository,
  Paging,
} from "../domain/ports/ReservationRepository.js";

/**
 * インメモリ予約リポジトリ（NFR-003/006）。
 * 設計 §4 の論理モデルを Map で鏡写しにする。占有一意性は
 * `Map<"spaceId#slotEpoch", ReservationId>` の同期 check-and-set で強制（ADR-002/003）。
 * JS は単一スレッドのため save 内に await を挟まず、確保はアトミックに完結する。
 */
export class InMemoryReservationRepository implements ReservationRepository {
  /** id → スナップショット（行のコピー）。 */
  private readonly store = new Map<string, ReservationSnapshot>();
  /** "spaceId#slotEpoch" → 占有中の予約ID（部分ユニークインデックス相当, active のみ）。 */
  private readonly occupancy = new Map<string, string>();

  private slotKey(spaceId: string, slotEpoch: number): string {
    return `${spaceId}#${slotEpoch}`;
  }

  save(reservation: Reservation): Result<void, ConflictError | IllegalState> {
    const snap = reservation.toSnapshot();
    const existing = this.store.get(snap.id);

    // 楽観ロック: 既存より version が進んでいなければ競合（状態遷移競合の検出）。
    if (existing && snap.version <= existing.version) {
      return err(illegalState("予約が他の操作で更新されています（競合）"));
    }

    const wantsOccupancy = isOccupying(snap.status);
    const desiredKeys = wantsOccupancy
      ? snap.slotStartsEpoch.map((e) => this.slotKey(snap.spaceId, e))
      : [];

    // 占有競合の事前検出（他予約が保持していれば後勝ち拒否, FR-013）。
    for (const key of desiredKeys) {
      const owner = this.occupancy.get(key);
      if (owner !== undefined && owner !== snap.id) {
        return err(conflictError("すでに予約されました"));
      }
    }

    // コミット: この予約が保持していた占有を一旦解放し、必要なら再確保する。
    const toRelease: string[] = [];
    for (const [key, owner] of this.occupancy) {
      if (owner === snap.id) toRelease.push(key);
    }
    for (const key of toRelease) this.occupancy.delete(key);
    for (const key of desiredKeys) this.occupancy.set(key, snap.id);

    this.store.set(snap.id, snap);
    return ok(undefined);
  }

  byId(id: ReservationId): Reservation | undefined {
    const snap = this.store.get(id);
    return snap ? Reservation.restore(snap) : undefined;
  }

  byNumber(reservationNumber: string): Reservation | undefined {
    for (const snap of this.store.values()) {
      if (snap.reservationNumber === reservationNumber) return Reservation.restore(snap);
    }
    return undefined;
  }

  byCustomer(customerId: CustomerId): Reservation[] {
    const out: Reservation[] = [];
    for (const snap of this.store.values()) {
      if (snap.customerId === customerId) out.push(Reservation.restore(snap));
    }
    return out;
  }

  occupiedSlots(
    spaceId: SpaceId,
    fromInclusive: JstDateTime,
    toExclusive: JstDateTime,
  ): JstDateTime[] {
    const from = fromInclusive.epochMillis;
    const to = toExclusive.epochMillis;
    const out: JstDateTime[] = [];
    for (const snap of this.store.values()) {
      if (snap.spaceId !== spaceId || !isOccupying(snap.status)) continue;
      for (const e of snap.slotStartsEpoch) {
        if (e >= from && e < to) out.push(JstDateTime.fromEpochMillis(e));
      }
    }
    return out;
  }

  list(filter: ReservationListFilter, paging: Paging): Page<Reservation> {
    const fromEpoch = filter.fromInclusive?.epochMillis;
    const toEpoch = filter.toExclusive?.epochMillis;
    const matched = [...this.store.values()].filter((snap) => {
      if (filter.status !== undefined && snap.status !== filter.status) return false;
      if (filter.spaceId !== undefined && snap.spaceId !== filter.spaceId) return false;
      const startEpoch = snap.slotStartsEpoch[0];
      if (fromEpoch !== undefined && (startEpoch === undefined || startEpoch < fromEpoch)) return false;
      if (toEpoch !== undefined && (startEpoch === undefined || startEpoch >= toEpoch)) return false;
      return true;
    });
    matched.sort((a, b) => b.createdAtEpoch - a.createdAtEpoch);

    const total = matched.length;
    const startIndex = (paging.page - 1) * paging.size;
    const items = matched
      .slice(startIndex, startIndex + paging.size)
      .map((snap) => Reservation.restore(snap));

    return { items, total, page: paging.page, size: paging.size };
  }

  confirmedStartingBetween(
    fromInclusive: JstDateTime,
    toExclusive: JstDateTime,
  ): Reservation[] {
    const from = fromInclusive.epochMillis;
    const to = toExclusive.epochMillis;
    const out: Reservation[] = [];
    for (const snap of this.store.values()) {
      if (snap.status !== "Confirmed") continue;
      const startEpoch = snap.slotStartsEpoch[0];
      if (startEpoch !== undefined && startEpoch >= from && startEpoch < to) {
        out.push(Reservation.restore(snap));
      }
    }
    return out;
  }
}
