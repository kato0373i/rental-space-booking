import type { SpaceId } from "../../../shared/domain/Id.js";
import type { Result } from "../../../shared/domain/Result.js";
import { err, ok } from "../../../shared/domain/Result.js";
import type { Actor } from "../../../shared/auth.js";
import { requireAdmin } from "../../../shared/auth.js";
import type { ForbiddenError, NotFound, ValidationError } from "../../../shared/errors.js";
import { notFound } from "../../../shared/errors.js";
import type { SpaceRepository } from "../domain/ports/SpaceRepository.js";
import { buildSpaceAttributes, type SpaceInput } from "./spaceFactory.js";

export type EditSpaceInput = SpaceInput & { readonly spaceId: SpaceId };

/**
 * スペース編集（FR-002, 管理者のみ）。
 * 料金改定後に作成される予約のみ新単価が適用され、既存の確定予約はスナップショットで維持される（ADR-006）。
 */
export class EditSpace {
  constructor(private readonly spaces: SpaceRepository) {}

  async execute(
    actor: Actor,
    input: EditSpaceInput,
  ): Promise<Result<void, ForbiddenError | NotFound | ValidationError>> {
    const auth = requireAdmin(actor);
    if (!auth.ok) return auth;

    const space = await this.spaces.byId(input.spaceId);
    if (!space) return err(notFound("スペースが見つかりません"));

    const attrs = buildSpaceAttributes(input);
    if (!attrs.ok) return attrs;

    const edited = space.edit(attrs.value);
    if (!edited.ok) return edited;

    await this.spaces.save(space);
    return ok(undefined);
  }
}
