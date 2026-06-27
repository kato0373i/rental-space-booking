import type { SpaceId } from "../../../../shared/domain/Id.js";
import type { Space } from "../Space.js";

/**
 * スペース集約の永続化ポート（インメモリ/RDS・Blocks 切替点, NFR-006）。
 * 全メソッド非同期（Promise）。AWS Blocks Database 等の実 I/O 実装を同一ポートで受ける
 * （設計 docs/design/aws-blocks-async-ports.md, ADR-AB01）。
 */
export interface SpaceRepository {
  save(space: Space): Promise<void>;
  byId(id: SpaceId): Promise<Space | undefined>;
  all(): Promise<Space[]>;
}
