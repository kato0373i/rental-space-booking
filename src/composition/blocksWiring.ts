import { fileURLToPath } from "node:url";
import { Scope } from "@aws-blocks/core";
import { Database, EmailClient } from "@aws-blocks/blocks";
import { BlocksEventBus } from "../shared/infrastructure/BlocksEventBus.js";
import {
  BlocksReservationRepository,
  type SqlDatabase,
} from "../contexts/booking/infrastructure/BlocksReservationRepository.js";
import { BlocksReminderLog } from "../contexts/booking/infrastructure/BlocksReminderLog.js";
import { BlocksSpaceRepository } from "../contexts/space/infrastructure/BlocksSpaceRepository.js";
import { InMemoryCustomerRepository } from "../contexts/customer/infrastructure/InMemoryCustomerRepository.js";
import { CognitoAuthGateway } from "../contexts/customer/infrastructure/CognitoAuthGateway.js";
import { AuthCognitoClient } from "../contexts/customer/infrastructure/AuthCognitoClient.js";
import { CustomerEmailResolver } from "../contexts/customer/application/CustomerEmailResolver.js";
import { MockNotificationAdapter } from "../contexts/notification/infrastructure/MockNotificationAdapter.js";
import { SesNotificationAdapter } from "../contexts/notification/infrastructure/SesNotificationAdapter.js";
import { TeeNotificationAdapter } from "../contexts/notification/infrastructure/TeeNotificationAdapter.js";
import type { BackendInfra } from "./container.js";

/**
 * AWS Blocks（Node 専用）に依存する合成をここに隔離する（#6 build:web 対応）。
 *
 * `container.ts`（およびブラウザ既定の memory 経路）からは本モジュールを **静的 import しない**。
 * `createWebApp({ backend: "blocks" })` から**動的 import** することで、`@aws-blocks/*` を含むコードが
 * ブラウザSPAバンドル（memory 既定）に取り込まれないようにする（ADR-AB11 / §9#6）。
 * サーバ（dev:blocks / デプロイ）と node テストからは通常どおり利用できる。
 */

/**
 * AWS Blocks Database を構築する（#8/#9）。予約・スペース・リマインドログで共有する。
 * ローカルは PGlite（`.bb-data/` に永続化, AWSアカウント不要）、デプロイ時は Aurora。
 */
function createBlocksDb(scopeId: string): SqlDatabase {
  const migrationsPath = fileURLToPath(new URL("../../aws-blocks/migrations", import.meta.url));
  const db = new Database(new Scope(scopeId), "main", { migrationsPath });
  return db as unknown as SqlDatabase;
}

/**
 * blocks バックエンドの backend 依存インフラ一式（リポジトリ/イベントバス/認証/通知）を構築する。
 * `createContainer({ backend: "blocks", blocksInfra })` に注入される（ADR-AB03/AB11）。
 */
export function buildBlocksInfra(args: {
  readonly scopeId: string;
  readonly silentNotifications: boolean;
}): BackendInfra {
  const scope = new Scope(args.scopeId);
  const db = createBlocksDb(args.scopeId);

  const customers = new InMemoryCustomerRepository();
  const notifier = new MockNotificationAdapter(!args.silentNotifications);

  // blocks では SES（Email Block）へ送信しつつ、デモ用の送信ログ（Mock）も Tee で温存する（#11）。
  const notifyPort = new TeeNotificationAdapter([
    new SesNotificationAdapter(
      new EmailClient(scope, "notifications", { fromAddress: "noreply@example.com" }),
      new CustomerEmailResolver(customers),
    ),
    notifier,
  ]);

  return {
    bus: new BlocksEventBus(scope),
    spaces: new BlocksSpaceRepository(db),
    reservations: new BlocksReservationRepository(db),
    reminderLog: new BlocksReminderLog(db),
    customers,
    auth: new CognitoAuthGateway(new AuthCognitoClient(scope, "auth")),
    notifier,
    notifyPort,
  };
}
