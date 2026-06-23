import { FixedClock } from "./shared/domain/Clock.js";
import { JstDateTime } from "./shared/domain/JstDateTime.js";
import { ReservationId } from "./shared/domain/Id.js";
import { createContainer } from "./composition/container.js";
import { seed } from "./composition/seed.js";

/**
 * コンソールデモ（NFR-004）。主要フローを順に実行して結果を出力する。
 * 実行: `npm run demo`
 */
async function main(): Promise<void> {
  const now = JstDateTime.ofJstUnsafe(2026, 6, 22, 9, 0); // 月曜 09:00 JST
  const clock = new FixedClock(now);
  const app = createContainer({ clock });
  const { spaceId } = seed(app);

  const bookingDay = JstDateTime.ofJstUnsafe(2026, 6, 24, 0, 0); // 水曜
  const slot10 = JstDateTime.ofJstUnsafe(2026, 6, 24, 10, 0);
  const slot11 = JstDateTime.ofJstUnsafe(2026, 6, 24, 11, 0);

  const line = (s: string) => console.info(s);
  line(`現在時刻: ${now.toIsoJst()} / 対象日: ${bookingDay.toIsoJst()}（${slot10.dayKind()}）`);

  // 1) 空き枠照会
  const avail1 = app.searchAvailability.execute({ spaceId, fromDay: bookingDay, toDay: bookingDay });
  line(`\n[空き枠照会] 空き ${avail1.ok ? avail1.value.freeSlots.length : "-"} スロット`);

  // 2) 見積もり（10:00-12:00 の2スロット）
  const quote = app.quoteReservation.execute({ spaceId, slotStarts: [slot10, slot11] });
  line(`[見積もり] ${quote.ok ? quote.value.toString() : JSON.stringify(quote.error)}`);

  // 3) 予約作成（決済成功）
  const placed = await app.placeReservation.execute({
    spaceId,
    slotStarts: [slot10, slot11],
    contact: { name: "佐藤花子", email: "hanako@example.com", phone: "080-1111-2222" },
    paymentToken: "tok_mock",
  });
  if (!placed.ok) {
    line(`[予約作成] 失敗: ${JSON.stringify(placed.error)}`);
    return;
  }
  line(`[予約作成] 確定 予約番号=${placed.value.reservationNumber} 金額=${placed.value.priceJpy}円`);
  const reservationId = ReservationId.of(placed.value.reservationId);

  // 4) 空き枠が減ったことを確認
  const avail2 = app.searchAvailability.execute({ spaceId, fromDay: bookingDay, toDay: bookingDay });
  line(`[空き枠照会] 予約後の空き ${avail2.ok ? avail2.value.freeSlots.length : "-"} スロット`);

  // 5) ダブルブッキング（同一スロット）→ 競合
  const dup = await app.placeReservation.execute({
    spaceId,
    slotStarts: [slot10, slot11],
    contact: { name: "別人", email: "other@example.com", phone: "070-3333-4444" },
  });
  line(`[競合予約] ${dup.ok ? "成立してしまった(NG)" : `拒否: ${dup.error.kind} - ${dup.error.message}`}`);

  // 6) リマインド（利用開始24時間前にトリガ）
  app.notifier.clear();
  const reminderTime = JstDateTime.ofJstUnsafe(2026, 6, 23, 10, 0); // 開始の24h前
  clock.set(reminderTime);
  const reminded = app.triggerReminders.execute({ referenceTime: reminderTime });
  line(`[リマインド] 送信 ${reminded.sent} 件`);

  // 7) キャンセル（利用開始24時間前 → 料率50%）
  const cancelled = await app.cancelReservation.execute({
    reservationId,
    email: "hanako@example.com",
  });
  line(
    `[キャンセル] ${
      cancelled.ok
        ? `料率${cancelled.value.ratePct}% キャンセル料=${cancelled.value.feeJpy}円 返金=${cancelled.value.refundJpy}円`
        : JSON.stringify(cancelled.error)
    }`,
  );

  // 8) 決済失敗のフロー
  clock.set(now);
  app.payment.setBehavior("Fail");
  const failed = await app.placeReservation.execute({
    spaceId,
    slotStarts: [slot10, slot11],
    contact: { name: "決済失敗太郎", email: "fail@example.com", phone: "090-5555-6666" },
  });
  line(`[決済失敗] ${failed.ok ? "確定(NG)" : `${failed.error.kind} - ${failed.error.message}`}`);

  // 9) 決済失敗でスロットが解放されていることを確認
  app.payment.setBehavior("Succeed");
  const avail3 = app.searchAvailability.execute({ spaceId, fromDay: bookingDay, toDay: bookingDay });
  line(`[空き枠照会] 決済失敗後の空き ${avail3.ok ? avail3.value.freeSlots.length : "-"} スロット（解放確認）`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
