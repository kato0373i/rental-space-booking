import type { Clock } from "../../../shared/domain/Clock.js";
import type { SpaceId } from "../../../shared/domain/Id.js";
import type { JstDateTime } from "../../../shared/domain/JstDateTime.js";
import type { Result } from "../../../shared/domain/Result.js";
import { ok } from "../../../shared/domain/Result.js";
import type { Actor } from "../../../shared/auth.js";
import { requireAdmin } from "../../../shared/auth.js";
import type { ForbiddenError } from "../../../shared/errors.js";
import type { ReservationStatus } from "../domain/ReservationStatus.js";
import type {
  Page,
  ReservationListFilter,
  ReservationRepository,
} from "../domain/ports/ReservationRepository.js";
import { toReservationView, type ReservationView } from "./ReservationView.js";

const DEFAULT_SIZE = 20;
const MAX_SIZE = 100;

export type ListAllInput = {
  readonly status?: ReservationStatus;
  readonly spaceId?: SpaceId;
  /** 利用開始がこの時刻以降（期間フィルタ, FR-AD05）。 */
  readonly fromInclusive?: JstDateTime;
  /** 利用開始がこの時刻より前。 */
  readonly toExclusive?: JstDateTime;
  readonly page?: number;
  readonly size?: number;
};

/** 管理者による全予約の横断一覧（FR-019, オフセットページング）。 */
export class ListAllReservations {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: Actor,
    input: ListAllInput,
  ): Promise<Result<Page<ReservationView>, ForbiddenError>> {
    const auth = requireAdmin(actor);
    if (!auth.ok) return auth;

    const page = Math.max(1, input.page ?? 1);
    const size = Math.min(MAX_SIZE, Math.max(1, input.size ?? DEFAULT_SIZE));

    const filter: ReservationListFilter = {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.spaceId !== undefined ? { spaceId: input.spaceId } : {}),
      ...(input.fromInclusive !== undefined ? { fromInclusive: input.fromInclusive } : {}),
      ...(input.toExclusive !== undefined ? { toExclusive: input.toExclusive } : {}),
    };

    const result = await this.reservations.list(filter, { page, size });
    const now = this.clock.now();
    return ok({
      items: result.items.map((r) => toReservationView(r, now)),
      total: result.total,
      page: result.page,
      size: result.size,
    });
  }
}
