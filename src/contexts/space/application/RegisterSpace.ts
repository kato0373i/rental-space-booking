import { SpaceId } from "../../../shared/domain/Id.js";
import type { Result } from "../../../shared/domain/Result.js";
import { ok } from "../../../shared/domain/Result.js";
import type { Actor } from "../../../shared/auth.js";
import { requireAdmin } from "../../../shared/auth.js";
import type { ForbiddenError, ValidationError } from "../../../shared/errors.js";
import { Space } from "../domain/Space.js";
import type { SpaceRepository } from "../domain/ports/SpaceRepository.js";
import { buildSpaceAttributes, type SpaceInput } from "./spaceFactory.js";

/** スペース登録（FR-001, 管理者のみ）。新規は公開状態で作成される。 */
export class RegisterSpace {
  constructor(private readonly spaces: SpaceRepository) {}

  execute(
    actor: Actor,
    input: SpaceInput,
  ): Result<{ readonly spaceId: string }, ForbiddenError | ValidationError> {
    const auth = requireAdmin(actor);
    if (!auth.ok) return auth;

    const attrs = buildSpaceAttributes(input);
    if (!attrs.ok) return attrs;

    const id = SpaceId.generate();
    const space = Space.register(attrs.value, id);
    if (!space.ok) return space;

    this.spaces.save(space.value);
    return ok({ spaceId: id });
  }
}
