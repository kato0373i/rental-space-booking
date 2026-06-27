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
  /** 'Published' / 'Suspended'（管理者一覧用, B-2）。 */
  readonly publishState: string;
};

const hhmm = (minuteOfDay: number): string => {
  const h = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const m = String(minuteOfDay % 60).padStart(2, "0");
  return `${h}:${m}`;
};

/**
 * スペース一覧（FR-F01）。既定は公開中のみ（ゲスト用）。
 * includeSuspended=true で公開停止を含む全件を返す（管理者用, B-2）。
 * UI がリポジトリを直接触らずに済むようにアプリ層のクエリとして提供する（NFR-F04）。
 */
export class ListSpaces {
  constructor(private readonly spaces: SpaceRepository) {}

  async execute(includeSuspended = false): Promise<SpaceSummary[]> {
    const spaces = await this.spaces.all();
    return spaces
      .filter((s) => includeSuspended || s.isPublished())
      .map((s) => ({
        spaceId: s.id,
        name: s.name,
        capacity: s.capacity.value,
        businessHours: `${hhmm(s.businessHours.openMinute)}–${hhmm(s.businessHours.closeMinute)}`,
        slotMinutes: s.slotDefinition.slotMinutes,
        minSlots: s.minSlots,
        maxSlots: s.maxSlots,
        publishState: s.isPublished() ? "Published" : "Suspended",
      }));
  }
}
