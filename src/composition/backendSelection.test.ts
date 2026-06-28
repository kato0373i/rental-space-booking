import { describe, expect, it } from "vitest";
import { InMemoryReservationRepository } from "../contexts/booking/infrastructure/InMemoryReservationRepository.js";
import { BlocksReservationRepository } from "../contexts/booking/infrastructure/BlocksReservationRepository.js";
import { InMemorySpaceRepository } from "../contexts/space/infrastructure/InMemorySpaceRepository.js";
import { BlocksSpaceRepository } from "../contexts/space/infrastructure/BlocksSpaceRepository.js";
import { createContainer } from "./container.js";

// backend 切替シームの契約を固定する（#7 基盤 → #8 予約 → #9 スペース → #10 認証 を活性化）。
describe("createContainer backend 選択", () => {
  it("既定（未指定）は memory（インメモリ実装）で構築される", () => {
    const c = createContainer({ silentNotifications: true });
    expect(c.reservations).toBeInstanceOf(InMemoryReservationRepository);
    expect(c.spaces).toBeInstanceOf(InMemorySpaceRepository);
  });

  it('backend "memory" を明示しても同じくインメモリ実装', () => {
    const c = createContainer({ backend: "memory", silentNotifications: true });
    expect(c.reservations).toBeInstanceOf(InMemoryReservationRepository);
    expect(c.spaces).toBeInstanceOf(InMemorySpaceRepository);
  });

  it('backend "blocks" は予約・スペースを AWS Blocks Database 実装に切り替える（#8/#9）', () => {
    const c = createContainer({ backend: "blocks", silentNotifications: true });
    expect(c.reservations).toBeInstanceOf(BlocksReservationRepository);
    expect(c.spaces).toBeInstanceOf(BlocksSpaceRepository);
    // 認証は Authentication Block(Cognito) 実装に切替（#10, ADR-AB07）。プロフィール（連絡先 PII）は
    // 認証 Block と役割分担し、インメモリ共存のまま（ADR-AB07 / §9）。
    expect(c.customers).toBeDefined();
    expect(c.login).toBeDefined();
  });
});
