import { EmailErrors, type EmailMessage, type SendResult } from "@aws-blocks/blocks";
import { describe, expect, it } from "vitest";

import { CustomerId } from "../../../shared/domain/Id.js";
import type {
  NotificationMessage,
  NotificationPort,
} from "../../booking/application/ports/NotificationPort.js";
import type { EmailRecipientResolver } from "../application/ports/EmailRecipientResolver.js";
import { MockNotificationAdapter } from "./MockNotificationAdapter.js";
import { SesNotificationAdapter, type EmailSender } from "./SesNotificationAdapter.js";
import { TeeNotificationAdapter } from "./TeeNotificationAdapter.js";

const REAL_EMAIL = "guest@example.com";
const customerId = CustomerId.of("cust-1");

const message = (over: Partial<NotificationMessage> = {}): NotificationMessage => ({
  kind: "Confirmed",
  recipientRef: customerId,
  maskedRecipient: "g***@example.com",
  reservationNumber: "RSV-0001",
  body: "予約が確定しました。開始 2026-06-24T10:00+09:00 / 金額 ¥1,000",
  ...over,
});

class FakeEmail implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failNext = false;
  async send(m: EmailMessage): Promise<SendResult> {
    if (this.failNext) {
      // 生エラーには実アドレスが含まれ得る、という現実を模す。
      const e = new Error(`SES rejected recipient ${REAL_EMAIL}`);
      e.name = EmailErrors.SendFailed;
      throw e;
    }
    this.sent.push(m);
    return { messageId: `mock-${this.sent.length}` };
  }
}

const resolverFor = (map: Record<string, string>): EmailRecipientResolver => ({
  realEmailFor: (id) => map[id],
});

describe("SesNotificationAdapter（Email Block / SES, #11）", () => {
  it("解決した実アドレスへ件名つきで送信する（本文に予約番号を含む）", async () => {
    const email = new FakeEmail();
    const adapter = new SesNotificationAdapter(email, resolverFor({ "cust-1": REAL_EMAIL }));

    await adapter.send(message());

    expect(email.sent).toHaveLength(1);
    const sent = email.sent[0]!;
    expect(sent.to).toBe(REAL_EMAIL);
    expect(sent.subject).toContain("確定");
    expect(sent.body).toContain("RSV-0001");
  });

  it("宛先未解決なら送信せずスキップ（throw しない）", async () => {
    const email = new FakeEmail();
    const adapter = new SesNotificationAdapter(email, resolverFor({}));

    await expect(adapter.send(message())).resolves.toBeUndefined();
    expect(email.sent).toHaveLength(0);
  });

  it("送信失敗時は生PIIを含まないエラーへ整形して投げ直す（NFR-002）", async () => {
    const email = new FakeEmail();
    email.failNext = true;
    const adapter = new SesNotificationAdapter(email, resolverFor({ "cust-1": REAL_EMAIL }));

    await expect(adapter.send(message())).rejects.toThrowError(/メール送信に失敗/);
    // 整形後のエラーには実アドレスを含めない。
    await adapter.send(message()).catch((e: unknown) => {
      expect(String((e as Error).message)).not.toContain(REAL_EMAIL);
    });
  });
});

describe("TeeNotificationAdapter（SES 実送信＋デモログ温存, #11）", () => {
  it("全ターゲットへファンアウトする（SES と Mock の双方が受け取る）", async () => {
    const email = new FakeEmail();
    const ses = new SesNotificationAdapter(email, resolverFor({ "cust-1": REAL_EMAIL }));
    const mock = new MockNotificationAdapter(false);
    const tee: NotificationPort = new TeeNotificationAdapter([ses, mock]);

    await tee.send(message());

    expect(email.sent).toHaveLength(1);
    expect(mock.sentOfKind("Confirmed")).toHaveLength(1);
  });

  it("一部失敗を集約して報告する（他ターゲットは送信済み）", async () => {
    const email = new FakeEmail();
    email.failNext = true;
    const ses = new SesNotificationAdapter(email, resolverFor({ "cust-1": REAL_EMAIL }));
    const mock = new MockNotificationAdapter(false);
    const tee = new TeeNotificationAdapter([ses, mock]);

    await expect(tee.send(message())).rejects.toThrowError(/一部送信に失敗/);
    // Mock 側は成功している（ファンアウトは独立）。
    expect(mock.sentOfKind("Confirmed")).toHaveLength(1);
  });
});
