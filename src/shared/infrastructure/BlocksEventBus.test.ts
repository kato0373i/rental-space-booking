import { randomUUID } from "node:crypto";
import { Scope } from "@aws-blocks/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent } from "../domain/DomainEvent.js";
import { JstDateTime } from "../domain/JstDateTime.js";
import { BlocksEventBus } from "./BlocksEventBus.js";

const evt = (type: string): DomainEvent => ({
  type,
  occurredAt: JstDateTime.ofJstUnsafe(2026, 6, 20, 9, 0),
});

/** AsyncJob モックは setTimeout でワーカー実行・即時リトライする。落ち着くまでマクロタスクを排出する。 */
const settle = async (predicate: () => boolean, maxTicks = 100): Promise<void> => {
  for (let i = 0; i < maxTicks; i += 1) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("BlocksEventBus（Background jobs Block / 非同期・リトライ・DLQ, #13）", () => {
  let scope: Scope;
  beforeEach(() => {
    scope = new Scope(`test-bus-${randomUUID()}`);
  });

  it("publish は即時に返り、ハンドラはワーカーで非同期実行される", async () => {
    const bus = new BlocksEventBus(scope);
    const received: string[] = [];
    bus.subscribe("Confirmed", (e) => {
      received.push(e.type);
    });

    bus.publish(evt("Confirmed"));
    // publish 直後は未実行（非同期）。
    expect(received).toEqual([]);

    await settle(() => bus.completedCount() >= 1);
    expect(received).toEqual(["Confirmed"]);
    expect(bus.completedCount()).toBe(1);
    expect(bus.deadLetterCount()).toBe(0);
  });

  it("購読していない type のイベントは何もしない（ハンドラ無しで完了）", async () => {
    const bus = new BlocksEventBus(scope);
    let calls = 0;
    bus.subscribe("Confirmed", () => {
      calls += 1;
    });
    bus.publish(evt("Cancelled"));
    await settle(() => bus.completedCount() >= 1);
    expect(calls).toBe(0);
  });

  it("ハンドラが一時的に失敗してもリトライで最終的に成功する", async () => {
    const bus = new BlocksEventBus(scope, { maxRetries: 3 });
    let attempts = 0;
    bus.subscribe("Confirmed", () => {
      attempts += 1;
      if (attempts < 3) throw new Error("一時障害");
    });

    bus.publish(evt("Confirmed"));
    await settle(() => bus.completedCount() + bus.deadLetterCount() >= 1);

    expect(attempts).toBe(3);
    expect(bus.completedCount()).toBe(1);
    expect(bus.deadLetterCount()).toBe(0);
  });

  it("maxRetries を超えて失敗し続けると DLQ に送られる", async () => {
    const bus = new BlocksEventBus(scope, { maxRetries: 3 });
    let attempts = 0;
    bus.subscribe("Confirmed", () => {
      attempts += 1;
      throw new Error("恒久障害");
    });

    bus.publish(evt("Confirmed"));
    await settle(() => bus.deadLetterCount() >= 1);

    expect(attempts).toBe(3);
    expect(bus.completedCount()).toBe(0);
    expect(bus.deadLetterCount()).toBe(1);
  });
});
