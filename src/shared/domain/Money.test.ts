import { describe, expect, it } from "vitest";
import { Money } from "./Money.js";

describe("Money（JPY単一通貨の金額VO）", () => {
  it("負数・非整数は作れない", () => {
    expect(Money.of(-1).ok).toBe(false);
    expect(Money.of(1.5).ok).toBe(false);
    expect(Money.of(0).ok).toBe(true);
  });

  it("加算・料率適用・減算クランプ", () => {
    const a = Money.ofUnsafe(1000);
    const b = Money.ofUnsafe(2000);
    expect(a.add(b).amount).toBe(3000);
    // 50% 適用（FR-015 キャンセル料）
    expect(Money.ofUnsafe(10000).applyRatePct(50).amount).toBe(5000);
    // 返金額は負にならない
    expect(a.subtractClamped(b).amount).toBe(0);
    expect(b.subtractClamped(a).amount).toBe(1000);
  });
});
