import { CustomerId, ReservationId, SpaceId } from "../shared/domain/Id.js";
import { JstDateTime } from "../shared/domain/JstDateTime.js";
import type { Actor } from "../shared/auth.js";
import type { AppError } from "../shared/errors.js";
import type { CancellationResult } from "../contexts/booking/application/cancellationFlow.js";
import type { PlaceReservationInput } from "../contexts/booking/application/PlaceReservation.js";
import type { ReservationView } from "../contexts/booking/application/ReservationView.js";
import type { NotificationMessage } from "../contexts/booking/application/ports/NotificationPort.js";
import type { SpaceSummary } from "../contexts/space/application/ListSpaces.js";
import { createContainer } from "./container.js";
import { seed } from "./seed.js";

// UI が触れる型はここに集約・再エクスポートする（UI→composition の単一依存, NFR-F04）。
export type { AppError, ReservationView, NotificationMessage, SpaceSummary, CancellationResult };

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
  readonly role: "Member";
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

/** UI が呼ぶアプリケーションサービスの facade（プリミティブ／DTO のみを授受）。 */
export type AppServices = {
  listSpaces(): SpaceSummary[];
  searchAvailability(spaceId: string, fromDayIso: string, toDayIso: string): UiResult<DayAvailabilityDto[]>;
  quote(spaceId: string, slotEpochs: readonly number[]): UiResult<number>;
  place(args: PlaceArgs): Promise<UiResult<PlaceResultDto>>;
  lookup(reservationNumber: string, email: string): UiResult<ReservationView>;
  cancel(reservationId: string, email: string): Promise<UiResult<CancellationResult>>;
  listMyReservations(memberId: string): ReservationView[];
  registerMember(input: ContactInput & { loginId: string; secret: string }): UiResult<{ customerId: string }>;
  login(loginId: string, secret: string): UiResult<SessionUser>;
  // デモ操作（ADR-F04）
  notifications(): NotificationMessage[];
  setPaymentBehavior(behavior: PaymentBehavior): void;
  triggerReminders(): number;
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

/**
 * ブラウザ内アプリの起動（ADR-F01）。コンテナ生成＋シードを行い、UI 向け facade を返す。
 * ページロードごとに1インスタンス。データはインメモリでリロード揮発（NFR-F03）。
 */
export function createWebApp(): AppServices {
  const c = createContainer();
  seed(c);

  return {
    listSpaces: () => c.listSpaces.execute(),

    searchAvailability: (spaceId, fromDayIso, toDayIso) => {
      const result = c.searchAvailability.execute({
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

    quote: (spaceId, slotEpochs) => {
      const result = c.quoteReservation.execute({
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

    registerMember: (input) => c.registerMember.execute(input),

    login: (loginId, secret) => {
      const result = c.loginMock.execute({ loginId, secret });
      if (!result.ok) return result;
      const actor: Actor = result.value;
      return { ok: true, value: { customerId: actor.customerId ?? "", role: "Member" } };
    },

    notifications: () => [...c.notifier.sent()],

    setPaymentBehavior: (behavior) => c.payment.setBehavior(behavior),

    triggerReminders: () => c.triggerReminders.execute({ referenceTime: c.clock.now() }).sent,
  };
}
