import type { SpaceId } from "../../../shared/domain/Id.js";
import type { Space } from "../domain/Space.js";
import type { SpaceRepository } from "../domain/ports/SpaceRepository.js";

/** インメモリのスペースリポジトリ（設定データ。Space は集約として参照保持で足りる）。 */
export class InMemorySpaceRepository implements SpaceRepository {
  private readonly store = new Map<string, Space>();

  save(space: Space): void {
    this.store.set(space.id, space);
  }

  byId(id: SpaceId): Space | undefined {
    return this.store.get(id);
  }

  all(): Space[] {
    return [...this.store.values()];
  }
}
