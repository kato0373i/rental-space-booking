import type { SpaceRepository } from "../domain/ports/SpaceRepository.js";

/** UI 向けのスペース概要（読み取り DTO）。FR-F01。 */
export type SpaceSummary = {
  readonly spaceId: string;
  readonly name: string;
  readonly capacity: number;
  readonly businessHours: string;
  readonly slotMinutes: number;
  readonly minSlots: number;
  readonly maxSlots: number;
};

const hhmm = (minuteOfDay: number): string => {
  const h = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const m = String(minuteOfDay % 60).padStart(2, "0");
  return `${h}:${m}`;
};

/**
 * 公開中スペースの一覧（FR-F01）。
 * UI がリポジトリを直接触らずに済むようにアプリ層のクエリとして提供する（NFR-F04）。
 */
export class ListSpaces {
  constructor(private readonly spaces: SpaceRepository) {}

  execute(): SpaceSummary[] {
    return this.spaces
      .all()
      .filter((s) => s.isPublished())
      .map((s) => ({
        spaceId: s.id,
        name: s.name,
        capacity: s.capacity.value,
        businessHours: `${hhmm(s.businessHours.openMinute)}–${hhmm(s.businessHours.closeMinute)}`,
        slotMinutes: s.slotDefinition.slotMinutes,
        minSlots: s.minSlots,
        maxSlots: s.maxSlots,
      }));
  }
}
