import type { SpaceId } from "../../../shared/domain/Id.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { Actor } from "../../../shared/auth.js";
import { requireAdmin } from "../../../shared/auth.js";
import type { ForbiddenError, NotFound } from "../../../shared/errors.js";
import { notFound } from "../../../shared/errors.js";
import type { SpaceRepository } from "../domain/ports/SpaceRepository.js";

/** スペースの公開停止（FR-003, 管理者のみ）。既存の確定予約は維持される。 */
export class SuspendSpace {
  constructor(private readonly spaces: SpaceRepository) {}

  async execute(
    actor: Actor,
    input: { readonly spaceId: SpaceId },
  ): Promise<Result<void, ForbiddenError | NotFound>> {
    const auth = requireAdmin(actor);
    if (!auth.ok) return auth;

    const space = await this.spaces.byId(input.spaceId);
    if (!space) return err(notFound("スペースが見つかりません"));

    space.suspend();
    await this.spaces.save(space);
    return ok(undefined);
  }
}
