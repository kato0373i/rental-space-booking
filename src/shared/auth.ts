import type { CustomerId } from "./domain/Id.js";
import type { ForbiddenError } from "./errors.js";
import { forbiddenError } from "./errors.js";
import type { Result } from "./domain/Result.js";
import { err, ok } from "./domain/Result.js";

export type Role = "Admin" | "Member" | "Guest";

/** モック認証が供給するアクター。認可はアプリ層の入口で判定し、ドメインに持ち込まない（FR-042）。 */
export type Actor = {
  readonly role: Role;
  readonly customerId?: CustomerId;
};

/** 管理者ロールを要求する。ゲスト/会員は ForbiddenError。 */
export const requireAdmin = (actor: Actor): Result<void, ForbiddenError> =>
  actor.role === "Admin"
    ? ok(undefined)
    : err(forbiddenError("この操作には管理者権限が必要です"));
