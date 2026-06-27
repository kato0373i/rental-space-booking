import { describe, expect, it } from "vitest";
import { createContainer } from "./container.js";

// #7 基盤: backend 切替シームの契約を固定する。
// "memory"（既定）は従来どおりコンテナを構築でき、"blocks" は未実装として
// 明示的に失敗する（“動くように見えて中身が無い”状態を防ぐ）。
describe("createContainer backend 選択", () => {
  it("既定（未指定）は memory として構築できる", () => {
    const c = createContainer({ silentNotifications: true });
    expect(c.reservations).toBeDefined();
  });

  it('backend "memory" を明示しても構築できる', () => {
    const c = createContainer({ backend: "memory", silentNotifications: true });
    expect(c.spaces).toBeDefined();
  });

  it('backend "blocks" は未実装として throw する（#8 以降で実装）', () => {
    expect(() => createContainer({ backend: "blocks" })).toThrowError(/未実装/);
  });
});
