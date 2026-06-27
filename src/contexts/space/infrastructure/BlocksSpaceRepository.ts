import { sql } from "@aws-blocks/blocks";
import { SpaceId } from "../../../shared/domain/Id.js";
import { buildSpaceAttributes, type SpaceInput } from "../application/spaceFactory.js";
import { Space } from "../domain/Space.js";
import type { SpaceRepository } from "../domain/ports/SpaceRepository.js";
import type { SqlDatabase } from "../../booking/infrastructure/BlocksReservationRepository.js";

type SpaceRow = {
  readonly id: string;
  readonly input_json: string;
  readonly publish_state: string;
};

/** Space 集約を永続化用の SpaceInput（プリミティブ）へ写像する。 */
const toInput = (space: Space): SpaceInput => {
  const { openMinute, closeMinute } = space.businessHours;
  return {
    name: space.name,
    capacity: space.capacity.value,
    openHour: Math.floor(openMinute / 60),
    openMinute: openMinute % 60,
    closeHour: Math.floor(closeMinute / 60),
    closeMinute: closeMinute % 60,
    slotMinutes: space.slotDefinition.slotMinutes,
    minSlots: space.minSlots,
    maxSlots: space.maxSlots,
    bookableHorizonDays: space.bookableHorizonDays,
    rateRules: space.ratePlan.toRules(),
    cancellationTiers: space.cancellationPolicy.tiers.map((t) => ({
      hoursBefore: t.hoursBefore,
      feeRatePct: t.feeRatePct,
    })),
  };
};

/** 行から Space 集約を再構築する（保存時に検証済みのため失敗はデータ破損）。 */
const restore = (row: SpaceRow): Space => {
  const input = JSON.parse(row.input_json) as SpaceInput;
  const attrs = buildSpaceAttributes(input);
  if (!attrs.ok) {
    throw new Error(`スペースの復元に失敗しました(${row.id}): ${JSON.stringify(attrs.error)}`);
  }
  const space = Space.register(attrs.value, SpaceId.of(row.id));
  if (!space.ok) {
    throw new Error(`スペースの復元に失敗しました(${row.id}): ${JSON.stringify(space.error)}`);
  }
  // register は Published を返すため、保存状態が Suspended なら反映する。
  if (row.publish_state === "Suspended") space.value.suspend();
  return space.value;
};

/**
 * AWS Blocks Database（Postgres / ローカルは PGlite）によるスペースリポジトリ実装（#9）。
 * ポート契約はインメモリ実装と同値（契約テストで担保）。
 */
export class BlocksSpaceRepository implements SpaceRepository {
  constructor(private readonly db: SqlDatabase) {}

  async save(space: Space): Promise<void> {
    await this.db.execute(
      sql`INSERT INTO spaces (id, input_json, publish_state)
          VALUES (${space.id}, ${JSON.stringify(toInput(space))}, ${space.publishState})
          ON CONFLICT (id) DO UPDATE SET
            input_json = EXCLUDED.input_json,
            publish_state = EXCLUDED.publish_state`,
    );
  }

  async byId(id: SpaceId): Promise<Space | undefined> {
    const row = await this.db.queryOne<SpaceRow>(
      sql`SELECT id, input_json, publish_state FROM spaces WHERE id = ${id}`,
    );
    return row ? restore(row) : undefined;
  }

  async all(): Promise<Space[]> {
    const rows = await this.db.query<SpaceRow>(
      sql`SELECT id, input_json, publish_state FROM spaces`,
    );
    return rows.map(restore);
  }
}
