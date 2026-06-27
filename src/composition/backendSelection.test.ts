import { describe, expect, it } from "vitest";
import { InMemoryReservationRepository } from "../contexts/booking/infrastructure/InMemoryReservationRepository.js";
import { BlocksReservationRepository } from "../contexts/booking/infrastructure/BlocksReservationRepository.js";
import { createContainer } from "./container.js";

// backend 切替シームの契約を固定する（#7 基盤 → #8 で blocks の予約実装を活性化）。
describe("createContainer backend 選択", () => {
  it("既定（未指定）は memory（インメモリ予約実装）で構築される", () => {
    const c = createContainer({ silentNotifications: true });
    expect(c.reservations).toBeInstanceOf(InMemoryReservationRepository);
  });

  it('backend "memory" を明示しても同じくインメモリ実装', () => {
    const c = createContainer({ backend: "memory", silentNotifications: true });
    expect(c.reservations).toBeInstanceOf(InMemoryReservationRepository);
  });

  it('backend "blocks" は予約を AWS Blocks Database 実装に切り替える（#8）', () => {
    const c = createContainer({ backend: "blocks", silentNotifications: true });
    expect(c.reservations).toBeInstanceOf(BlocksReservationRepository);
    // スペース/顧客は移行途中のためインメモリのまま（ADR-AB05）。
    expect(c.spaces).toBeDefined();
    expect(c.customers).toBeDefined();
  });
});
