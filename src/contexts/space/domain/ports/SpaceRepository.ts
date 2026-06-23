import type { SpaceId } from "../../../../shared/domain/Id.js";
import type { Space } from "../Space.js";

/** スペース集約の永続化ポート（インメモリ/RDS 切替点, NFR-006）。 */
export interface SpaceRepository {
  save(space: Space): void;
  byId(id: SpaceId): Space | undefined;
  all(): Space[];
}
