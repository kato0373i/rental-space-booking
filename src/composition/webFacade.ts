import { CustomerId, ReservationId, SpaceId } from "../shared/domain/Id.js";
import { JstDateTime } from "../shared/domain/JstDateTime.js";
import type { Actor } from "../shared/auth.js";
import type { AppError } from "../shared/errors.js";
import type { CancellationResult } from "../contexts/booking/application/cancellationFlow.js";
import type { PlaceReservationInput } from "../contexts/booking/application/PlaceReservation.js";
import type { ReservationView } from "../contexts/booking/application/ReservationView.js";
import type { NotificationMessage } from "../contexts/booking/application/ports/NotificationPort.js";
import type { SpaceSummary } from "../contexts/space/application/ListSpaces.js";
import type { SpaceDetail } from "../contexts/space/application/GetSpaceDetail.js";
import type { SpaceInput } from "../contexts/space/application/spaceFactory.js";
import type { ReservationStatus } from "../contexts/booking/domain/ReservationStatus.js";
import { createContainer, type ContainerOptions } from "./container.js";
import { seed } from "./seed.js";

// UI が触れる型はここに集約・再エクスポートする（UI→composition の単一依存, NFR-F04）。
export type { AppError, ReservationView, NotificationMessage, SpaceSummary, CancellationResult, SpaceDetail };

/** スペース登録/編集フォーム入力（backend の SpaceInput に対応, B-3）。 */
export type AdminSpaceFormInput = SpaceInput;

/** UI 向けの Result（backend の Result と構造同一。ドメイン型を UI に漏らさないための別名）。 */
export type UiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AppError };

export type SlotDto = {
  readonly epochMillis: number;
  /** 表示用の時刻ラベル（例 "10:00"）。 */
  readonly timeLabel: string;
};

export type DayAvailabilityDto = {
  /** "YYYY-MM-DD"（JST）。 */
  readonly dateIso: string;
  /** 表示用の日付ラベル（例 "2026-06-24（水）"）。 */
  readonly dayLabel: string;
  readonly slots: SlotDto[];
};

export type ContactInput = {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
};

export type SessionUser = {
  readonly customerId: string;
  readonly role: "Member" | "Admin";
};

export type PlaceResultDto = {
  readonly reservationId: string;
  readonly reservationNumber: string;
  readonly priceJpy: number;
};

export type PaymentBehavior = "Succeed" | "Fail" | "Timeout";

export type PlaceArgs = {
  readonly spaceId: string;
  readonly slotEpochs: readonly number[];
  readonly contact?: ContactInput;
  readonly customerId?: string;
};

export type ReservationRow = ReservationView & { readonly maskedRecipient: string };

export type PageDto<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly size: number;
};

export type AdminReservationFilter = {
  readonly status?: string;
  readonly spaceId?: string;
  readonly fromDayIso?: string;
  readonly toDayIso?: string;
  readonly page?: number;
  readonly size?: number;
};

/** 管理者向け facade（認可は session のロールから Actor を構築し requireAdmin で強制, ADR-AD01）。 */
export type AdminApi = {
  listSpaces(session: SessionUser): Promise<SpaceSummary[]>;
  getSpaceDetail(session: SessionUser, spaceId: string): Promise<UiResult<SpaceDetail>>;
  registerSpace(session: SessionUser, form: AdminSpaceFormInput): Promise<UiResult<{ readonly spaceId: string }>>;
  editSpace(session: SessionUser, spaceId: string, form: AdminSpaceFormInput): Promise<UiResult<void>>;
  suspendSpace(session: SessionUser, spaceId: string): Promise<UiResult<void>>;
  resumeSpace(session: SessionUser, spaceId: string): Promise<UiResult<void>>;
  listReservations(session: SessionUser, filter: AdminReservationFilter): Promise<UiResult<PageDto<ReservationRow>>>;
  forceCancel(session: SessionUser, reservationId: string, overrideZeroRate: boolean): Promise<UiResult<CancellationResult>>;
  markNoShow(session: SessionUser, reservationId: string): Promise<UiResult<void>>;
};

/** UI が呼ぶアプリケーションサービスの facade（プリミティブ／DTO のみを授受）。 */
export type AppServices = {
  listSpaces(): Promise<SpaceSummary[]>;
  searchAvailability(spaceId: string, fromDayIso: string, toDayIso: string): Promise<UiResult<DayAvailabilityDto[]>>;
  quote(spaceId: string, slotEpochs: readonly number[]): Promise<UiResult<number>>;
  place(args: PlaceArgs): Promise<UiResult<PlaceResultDto>>;
  lookup(reservationNumber: string, email: string): Promise<UiResult<ReservationView>>;
  cancel(reservationId: string, email: string): Promise<UiResult<CancellationResult>>;
  listMyReservations(memberId: string): Promise<ReservationView[]>;
  registerMember(input: ContactInput & { loginId: string; secret: string }): Promise<UiResult<{ customerId: string }>>;
  login(loginId: string, secret: string): Promise<UiResult<SessionUser>>;
  // デモ操作（ADR-F04）
  notifications(): NotificationMessage[];
  setPaymentBehavior(behavior: PaymentBehavior): void;
  triggerReminders(): Promise<number>;
  // 管理者（FR-AD01〜09）
  admin: AdminApi;
};

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

const parseDay = (dayIso: string): JstDateTime => {
  const [y, mo, d] = dayIso.split("-").map((n) => Number(n));
  return JstDateTime.ofJstUnsafe(y ?? 1970, mo ?? 1, d ?? 1, 0, 0);
};

/** "YYYY-MM-DDTHH:mm+09:00" を JstDateTime に戻す（searchAvailability の ISO 出力用）。 */
const parseIsoJst = (iso: string): JstDateTime => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return JstDateTime.fromEpochMillis(0);
  return JstDateTime.ofJstUnsafe(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  );
};

/** UI セッションから認可用 Actor を構築する（ADR-AD01）。requireAdmin が最終強制。 */
const toActor = (session: SessionUser): Actor => ({
  role: session.role,
  ...(session.customerId ? { customerId: CustomerId.of(session.customerId) } : {}),
});

/**
 * アプリの起動。コンテナ生成＋シードを行い、UI 向け facade を返す（ADR-F01）。
 *
 * - 既定（memory）: ブラウザ内インメモリ。ページロードごとに1インスタンス・揮発（NFR-F03, ADR-F01）。
 * - `backend: "blocks"`: AWS Blocks の永続バックエンド（Database 永続・複数クライアント共有, #15）。
 *   この経路は `aws-blocks/index.ts` の RPC ハンドラ（合成ルート）から呼ばれ、型安全クライアント越しに UI へ繋がる。
 *
 * シードは冪等: すでにスペースが存在する（＝永続 DB が初期化済み/リロード）場合は再シードしない。
 */
export async function createWebApp(options: ContainerOptions = {}): Promise<AppServices> {
  const c = createContainer(options);
  // 永続バックエンドでは初回のみシードする（リロード・複数接続での重複登録を防ぐ）。
  if ((await c.listSpaces.execute(true)).length === 0) {
    await seed(c);
  }

  return {
    listSpaces: () => c.listSpaces.execute(),

    searchAvailability: async (spaceId, fromDayIso, toDayIso) => {
      const result = await c.searchAvailability.execute({
        spaceId: SpaceId.of(spaceId),
        fromDay: parseDay(fromDayIso),
        toDay: parseDay(toDayIso),
      });
      if (!result.ok) return result;

      const byDay = new Map<string, DayAvailabilityDto>();
      for (const iso of result.value.freeSlots) {
        const at = parseIsoJst(iso);
        const dateIso = iso.slice(0, 10);
        const dayLabel = `${dateIso}（${WEEKDAY_JA[at.dayOfWeekJst()] ?? ""}）`;
        let day = byDay.get(dateIso);
        if (!day) {
          day = { dateIso, dayLabel, slots: [] };
          byDay.set(dateIso, day);
        }
        day.slots.push({ epochMillis: at.epochMillis, timeLabel: iso.slice(11, 16) });
      }
      const days = [...byDay.values()].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
      return { ok: true, value: days };
    },

    quote: async (spaceId, slotEpochs) => {
      const result = await c.quoteReservation.execute({
        spaceId: SpaceId.of(spaceId),
        slotStarts: slotEpochs.map((e) => JstDateTime.fromEpochMillis(e)),
      });
      return result.ok ? { ok: true, value: result.value.amount } : result;
    },

    place: async (args) => {
      const input: PlaceReservationInput = {
        spaceId: SpaceId.of(args.spaceId),
        slotStarts: args.slotEpochs.map((e) => JstDateTime.fromEpochMillis(e)),
        ...(args.contact ? { contact: args.contact } : {}),
        ...(args.customerId ? { customerId: CustomerId.of(args.customerId) } : {}),
      };
      return c.placeReservation.execute(input);
    },

    lookup: (reservationNumber, email) =>
      c.lookupReservation.execute({ reservationNumber, email }),

    cancel: (reservationId, email) =>
      c.cancelReservation.execute({ reservationId: ReservationId.of(reservationId), email }),

    listMyReservations: (memberId) => c.listMyReservations.execute(CustomerId.of(memberId)),

    // 注: lookup / listMyReservations は内側の execute が既に Promise を返すため、
    // ここでは await せずそのまま返す（型は Promise<...> に一致する）。

    registerMember: (input) => c.registerMember.execute(input),

    login: async (loginId, secret) => {
      const result = await c.login.execute({ loginId, secret });
      if (!result.ok) return result;
      const actor: Actor = result.value;
      const role = actor.role === "Admin" ? "Admin" : "Member";
      return { ok: true, value: { customerId: actor.customerId ?? "", role } };
    },

    notifications: () => [...c.notifier.sent()],

    setPaymentBehavior: (behavior) => c.payment.setBehavior(behavior),

    triggerReminders: async () =>
      (await c.triggerReminders.execute({ referenceTime: c.clock.now() })).sent,

    admin: {
      listSpaces: () => c.listSpaces.execute(true),

      getSpaceDetail: (_session, spaceId) => c.getSpaceDetail.execute(SpaceId.of(spaceId)),

      registerSpace: (session, form) => c.registerSpace.execute(toActor(session), form),

      editSpace: (session, spaceId, form) =>
        c.editSpace.execute(toActor(session), { ...form, spaceId: SpaceId.of(spaceId) }),

      suspendSpace: (session, spaceId) =>
        c.suspendSpace.execute(toActor(session), { spaceId: SpaceId.of(spaceId) }),

      resumeSpace: (session, spaceId) =>
        c.resumeSpace.execute(toActor(session), { spaceId: SpaceId.of(spaceId) }),

      listReservations: async (session, filter) => {
        const r = await c.listAllReservations.execute(toActor(session), {
          ...(filter.status ? { status: filter.status as ReservationStatus } : {}),
          ...(filter.spaceId ? { spaceId: SpaceId.of(filter.spaceId) } : {}),
          ...(filter.fromDayIso ? { fromInclusive: parseDay(filter.fromDayIso) } : {}),
          ...(filter.toDayIso ? { toExclusive: parseDay(filter.toDayIso) } : {}),
          ...(filter.page ? { page: filter.page } : {}),
          ...(filter.size ? { size: filter.size } : {}),
        });
        if (!r.ok) return r;
        const items: ReservationRow[] = await Promise.all(
          r.value.items.map(async (v) => {
            const contact = await c.directory.contactOf(CustomerId.of(v.customerId));
            return {
              ...v,
              maskedRecipient: contact ? `${contact.maskedName} / ${contact.maskedEmail}` : "(不明)",
            };
          }),
        );
        return { ok: true, value: { items, total: r.value.total, page: r.value.page, size: r.value.size } };
      },

      forceCancel: (session, reservationId, overrideZeroRate) =>
        c.forceCancelReservation.execute(toActor(session), {
          reservationId: ReservationId.of(reservationId),
          overrideZeroRate,
        }),

      markNoShow: (session, reservationId) =>
        c.markNoShow.execute(toActor(session), { reservationId: ReservationId.of(reservationId) }),
      // 注: markNoShow / forceCancel は内側 execute が Promise を返すためそのまま返す。
    },
  };
}
