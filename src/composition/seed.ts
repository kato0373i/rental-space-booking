import type { Actor } from "../shared/auth.js";
import { CustomerId, SpaceId } from "../shared/domain/Id.js";
import type { SpaceInput } from "../contexts/space/application/spaceFactory.js";
import type { Container } from "./container.js";

/** デモ用の管理者アクター（モック認証, FR-042）。 */
export const ADMIN: Actor = { role: "Admin" };

export type SeedResult = {
  readonly spaceId: SpaceId;
  readonly memberId: CustomerId;
};

/** 会議室A のシード設定。営業 09:00–18:00 / 60分スロット / 平日1000・土日2000円。 */
const MEETING_ROOM_A: SpaceInput = {
  name: "会議室A",
  capacity: 8,
  openHour: 9,
  openMinute: 0,
  closeHour: 18,
  closeMinute: 0,
  slotMinutes: 60,
  minSlots: 1,
  maxSlots: 8,
  bookableHorizonDays: 30,
  rateRules: [
    { dayKind: "Weekday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 1000 },
    { dayKind: "Saturday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 2000 },
    { dayKind: "Sunday", fromHour: 9, fromMinute: 0, toHour: 18, toMinute: 0, unitPriceJpy: 2000 },
  ],
  // 48時間前まで無料、以降50%（U-01）。
  cancellationTiers: [
    { hoursBefore: 0, feeRatePct: 50 },
    { hoursBefore: 48, feeRatePct: 0 },
  ],
};

/**
 * 起動時シード（NFR-003）。プロセス再起動でデータが揮発するため、起動ごとに初期化する。
 * 管理者として 1 スペースを登録し、デモ用の会員を 1 名作成する。
 */
export function seed(container: Container): SeedResult {
  const registered = container.registerSpace.execute(ADMIN, MEETING_ROOM_A);
  if (!registered.ok) {
    throw new Error(`シードのスペース登録に失敗しました: ${JSON.stringify(registered.error)}`);
  }

  const member = container.registerMember.execute({
    name: "山田太郎",
    email: "taro@example.com",
    phone: "090-0000-0000",
    loginId: "taro",
    secret: "password",
  });
  if (!member.ok) {
    throw new Error(`シードの会員登録に失敗しました: ${JSON.stringify(member.error)}`);
  }

  return {
    spaceId: SpaceId.of(registered.value.spaceId),
    memberId: CustomerId.of(member.value.customerId),
  };
}
