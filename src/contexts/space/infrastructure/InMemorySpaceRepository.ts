import type { SpaceId } from "../../../shared/domain/Id.js";
import type { Space } from "../domain/Space.js";
import type { SpaceRepository } from "../domain/ports/SpaceRepository.js";

/** インメモリのスペースリポジトリ（設定データ。Space は集約として参照保持で足りる）。 */
export class InMemorySpaceRepository implements SpaceRepository {
  private readonly store = new Map<string, Space>();

  async save(space: Space): Promise<void> {
    this.store.set(space.id, space);
  }

  async byId(id: SpaceId): Promise<Space | undefined> {
    return this.store.get(id);
  }

  async all(): Promise<Space[]> {
    return [...this.store.values()];
  }
}
