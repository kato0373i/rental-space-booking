import { fileURLToPath } from "node:url";
import { Scope } from "@aws-blocks/core";
import { Database, EmailClient } from "@aws-blocks/blocks";
import type { Clock } from "../shared/domain/Clock.js";
import { SystemClock } from "../shared/domain/Clock.js";
import { InMemoryEventBus, type EventBus } from "../shared/domain/EventBus.js";
import { BlocksEventBus } from "../shared/infrastructure/BlocksEventBus.js";

// Booking
import { CancelReservation } from "../contexts/booking/application/CancelReservation.js";
import { ForceCancelReservation } from "../contexts/booking/application/ForceCancelReservation.js";
import { ListAllReservations } from "../contexts/booking/application/ListAllReservations.js";
import { ListMyReservations } from "../contexts/booking/application/ListMyReservations.js";
import { LookupReservation } from "../contexts/booking/application/LookupReservation.js";
import { MarkNoShow } from "../contexts/booking/application/MarkNoShow.js";
import { NotificationHandlers } from "../contexts/booking/application/NotificationHandlers.js";
import { PlaceReservation } from "../contexts/booking/application/PlaceReservation.js";
import { QuoteReservation } from "../contexts/booking/application/QuoteReservation.js";
import { SearchAvailability } from "../contexts/booking/application/SearchAvailability.js";
import { TriggerReminders } from "../contexts/booking/application/TriggerReminders.js";
import { SettleReservationPayment } from "../contexts/booking/application/SettleReservationPayment.js";
import type { CustomerDirectoryPort } from "../contexts/booking/application/ports/CustomerDirectoryPort.js";
import type { SpaceCatalogPort } from "../contexts/booking/application/ports/SpaceCatalogPort.js";
import { InMemoryReservationRepository } from "../contexts/booking/infrastructure/InMemoryReservationRepository.js";
import {
  BlocksReservationRepository,
  type SqlDatabase,
} from "../contexts/booking/infrastructure/BlocksReservationRepository.js";
import type { ReservationRepository } from "../contexts/booking/domain/ports/ReservationRepository.js";
import type { ReminderLog } from "../contexts/booking/application/ports/ReminderLog.js";
import { InMemoryReminderLog } from "../contexts/booking/infrastructure/InMemoryReminderLog.js";
import { BlocksReminderLog } from "../contexts/booking/infrastructure/BlocksReminderLog.js";

// Space
import { EditSpace } from "../contexts/space/application/EditSpace.js";
import { GetSpaceDetail } from "../contexts/space/application/GetSpaceDetail.js";
import { ListSpaces } from "../contexts/space/application/ListSpaces.js";
import { RegisterSpace } from "../contexts/space/application/RegisterSpace.js";
import { ResumeSpace } from "../contexts/space/application/ResumeSpace.js";
import { SpaceCatalogQueryService } from "../contexts/space/application/SpaceCatalogQueryService.js";
import { SuspendSpace } from "../contexts/space/application/SuspendSpace.js";
import { InMemorySpaceRepository } from "../contexts/space/infrastructure/InMemorySpaceRepository.js";
import { BlocksSpaceRepository } from "../contexts/space/infrastructure/BlocksSpaceRepository.js";
import type { SpaceRepository } from "../contexts/space/domain/ports/SpaceRepository.js";

// Customer
import { CustomerDirectoryService } from "../contexts/customer/application/CustomerDirectoryService.js";
import { Login } from "../contexts/customer/application/Login.js";
import { RegisterMember } from "../contexts/customer/application/RegisterMember.js";
import type { AuthGateway } from "../contexts/customer/application/ports/AuthGateway.js";
import { InMemoryCustomerRepository } from "../contexts/customer/infrastructure/InMemoryCustomerRepository.js";
import { InMemoryAuthGateway } from "../contexts/customer/infrastructure/InMemoryAuthGateway.js";
import { CognitoAuthGateway } from "../contexts/customer/infrastructure/CognitoAuthGateway.js";
import { AuthCognitoClient } from "../contexts/customer/infrastructure/AuthCognitoClient.js";

// Payment / Notification
import type { NotificationPort } from "../contexts/booking/application/ports/NotificationPort.js";
import { MockNotificationAdapter } from "../contexts/notification/infrastructure/MockNotificationAdapter.js";
import { SesNotificationAdapter } from "../contexts/notification/infrastructure/SesNotificationAdapter.js";
import { TeeNotificationAdapter } from "../contexts/notification/infrastructure/TeeNotificationAdapter.js";
import { CustomerEmailResolver } from "../contexts/customer/application/CustomerEmailResolver.js";
import { MockPaymentAdapter } from "../contexts/payment/infrastructure/MockPaymentAdapter.js";
import {
  StripePaymentAdapter,
  type StripeGateway,
} from "../contexts/payment/infrastructure/StripePaymentAdapter.js";
import type { PaymentPort } from "../contexts/booking/application/ports/PaymentPort.js";

export type Container = {
  readonly clock: Clock;
  readonly bus: EventBus;
  readonly payment: MockPaymentAdapter;
  readonly notifier: MockNotificationAdapter;
  readonly catalog: SpaceCatalogPort;
  readonly directory: CustomerDirectoryPort;
  /** スペースリポジトリ（backend に応じてインメモリ or AWS Blocks 実装。ADR-AB03）。 */
  readonly spaces: SpaceRepository;
  readonly customers: InMemoryCustomerRepository;
  /** 予約リポジトリ（backend に応じてインメモリ or AWS Blocks 実装。ADR-AB03）。 */
  readonly reservations: ReservationRepository;
  // Booking ユースケース
  readonly searchAvailability: SearchAvailability;
  readonly quoteReservation: QuoteReservation;
  readonly placeReservation: PlaceReservation;
  readonly cancelReservation: CancelReservation;
  readonly lookupReservation: LookupReservation;
  readonly listMyReservations: ListMyReservations;
  readonly forceCancelReservation: ForceCancelReservation;
  readonly markNoShow: MarkNoShow;
  readonly listAllReservations: ListAllReservations;
  readonly triggerReminders: TriggerReminders;
  /** 決済決着（Webhook→Background jobs）の予約反映（#14, ADR-AB10）。冪等。 */
  readonly settleReservationPayment: SettleReservationPayment;
  // Space ユースケース
  readonly registerSpace: RegisterSpace;
  readonly editSpace: EditSpace;
  readonly suspendSpace: SuspendSpace;
  readonly resumeSpace: ResumeSpace;
  readonly listSpaces: ListSpaces;
  readonly getSpaceDetail: GetSpaceDetail;
  // Customer ユースケース
  readonly registerMember: RegisterMember;
  /** ログイン。backend に応じてインメモリ/Cognito の認証 Block を利用（ADR-AB07）。 */
  readonly login: Login;
};

/**
 * リポジトリ/アダプタの実装系統。
 * - "memory": 既存のインメモリ/モック実装（既定。テスト・学習・デモ用）。
 * - "blocks": AWS Blocks ベースの実装。各コンテキストを Issue #8 以降で順次移行する。
 */
export type AppBackend = "memory" | "blocks";

export type ContainerOptions = {
  readonly clock?: Clock;
  /** 通知のコンソール出力を抑制する（テスト時 true）。 */
  readonly silentNotifications?: boolean;
  /** 実装系統の選択（既定 "memory"）。AWS Blocks 版は段階移行中。 */
  readonly backend?: AppBackend;
  /**
   * 外部決済プロバイダ（Stripe）ゲートウェイ（#14, ADR-AB10）。指定時は決済を {@link StripePaymentAdapter}
   * 経由で行う（実決済）。未指定なら従来どおりモック決済（デモ・テスト用に温存）。
   * AWS Blocks に決済 Block は無いため backend とは独立し、デプロイ時に実 Stripe SDK の実装を注入する。
   */
  readonly paymentGateway?: StripeGateway;
};

/**
 * 合成ルート（DI）。ポート↔実装の束ね（インメモリ/RDS・Blocks 切替点, NFR-006）。
 * 別のリポジトリ実装（AWS Blocks 等）へ差し替える場合、ここの new を差し替えるだけでよい。
 *
 * `backend: "blocks"` は予約コンテキスト（#8）を AWS Blocks Database 実装に切り替える。
 * スペース/顧客は #9/#10 まではインメモリのまま（移行途中の混在を許容, ADR-AB05）。
 */
export function createContainer(options: ContainerOptions = {}): Container {
  const backend: AppBackend = options.backend ?? "memory";

  const clock: Clock = options.clock ?? new SystemClock();
  // イベントバス（#13）。blocks は Background jobs Block（AsyncJob）で非同期＋リトライ/DLQ、
  // memory はプロセス内 fire-and-forget（ADR-AB09）。ポート（publish/subscribe）は共通。
  const bus: EventBus =
    backend === "blocks"
      ? new BlocksEventBus(new Scope("rental-space-booking"))
      : new InMemoryEventBus();

  // リポジトリ。予約・スペースは backend で切替（#8/#9）。顧客は順次移行（#10）。
  // blocks では 1 つの Database を予約・スペースで共有する（マイグレーションは初回クエリ時に一括適用）。
  const blocksDb = backend === "blocks" ? createBlocksDb() : undefined;
  const spaces: SpaceRepository = blocksDb
    ? new BlocksSpaceRepository(blocksDb)
    : new InMemorySpaceRepository();
  const customers = new InMemoryCustomerRepository();
  const reservations: ReservationRepository = blocksDb
    ? new BlocksReservationRepository(blocksDb)
    : new InMemoryReservationRepository();
  // リマインド冪等ログ（#12）。blocks は予約と同じ Database を共有する。
  const reminderLog: ReminderLog = blocksDb
    ? new BlocksReminderLog(blocksDb)
    : new InMemoryReminderLog();

  // 汎用サブドメイン（モックアダプタ）。payment はデモ/テスト用の introspection（setBehavior 等）を
  // 維持するため常に Mock を公開し、実決済の経路だけ paymentGateway 指定時に Stripe 実装へ差し替える（#14）。
  const payment = new MockPaymentAdapter();
  const paymentPort: PaymentPort = options.paymentGateway
    ? new StripePaymentAdapter(options.paymentGateway)
    : payment;
  const notifier = new MockNotificationAdapter(!options.silentNotifications);

  // Booking ポートの実装供給（依存性逆転）
  const catalog: SpaceCatalogPort = new SpaceCatalogQueryService(spaces);
  const directory: CustomerDirectoryPort = new CustomerDirectoryService(customers);

  // 通知購読（Booking → Notification, 結果整合）。
  // blocks では SES（Email Block）へ実送信しつつ、デモ用の送信ログ（notifier=Mock）も温存する（#11）。
  // memory では従来どおり Mock のみ。notifier 自体は常に Mock 型で公開し、introspection（sent/clear）を維持。
  const notifyPort: NotificationPort =
    backend === "blocks"
      ? new TeeNotificationAdapter([
          new SesNotificationAdapter(
            // ローカルは Email Block のモック（外部送信なし）。実送信切替時は
            // SES で検証済みの送信元アドレスへ差し替える（#15 / デプロイ時 TODO）。
            new EmailClient(new Scope("rental-space-booking"), "notifications", {
              fromAddress: "noreply@example.com",
            }),
            new CustomerEmailResolver(customers),
          ),
          notifier,
        ])
      : notifier;
  new NotificationHandlers(notifyPort, directory).register(bus);

  // 認証ゲートウェイ（ADR-AB07/AB03）。blocks では Authentication Block(Cognito) 実装、
  // memory では既存ドメイン（Customer.authenticate / Credential）を用いるインメモリ実装。
  // ローカルの Cognito は Block のモック（実 AWS 不要・外部 I/O なし）として動作する。
  const auth: AuthGateway =
    backend === "blocks"
      ? new CognitoAuthGateway(new AuthCognitoClient(new Scope("rental-space-booking"), "auth"))
      : new InMemoryAuthGateway(customers);

  return {
    clock,
    bus,
    payment,
    notifier,
    catalog,
    directory,
    spaces,
    customers,
    reservations,
    searchAvailability: new SearchAvailability(catalog, reservations),
    quoteReservation: new QuoteReservation(catalog),
    placeReservation: new PlaceReservation(catalog, directory, reservations, paymentPort, bus, clock),
    cancelReservation: new CancelReservation(reservations, paymentPort, bus, clock, directory),
    lookupReservation: new LookupReservation(reservations, directory, clock),
    listMyReservations: new ListMyReservations(reservations, clock),
    forceCancelReservation: new ForceCancelReservation(reservations, paymentPort, bus, clock),
    markNoShow: new MarkNoShow(reservations, clock),
    listAllReservations: new ListAllReservations(reservations, clock),
    triggerReminders: new TriggerReminders(reservations, bus, reminderLog),
    settleReservationPayment: new SettleReservationPayment(reservations, bus, clock),
    registerSpace: new RegisterSpace(spaces),
    editSpace: new EditSpace(spaces),
    suspendSpace: new SuspendSpace(spaces),
    resumeSpace: new ResumeSpace(spaces),
    listSpaces: new ListSpaces(spaces),
    getSpaceDetail: new GetSpaceDetail(spaces),
    registerMember: new RegisterMember(customers, auth),
    login: new Login(auth),
  };
}

/**
 * AWS Blocks Database を構築する（#8/#9）。予約・スペースのリポジトリで共有する。
 * ローカルは PGlite（`.bb-data/` に永続化, AWSアカウント不要）、デプロイ時は Aurora。
 * マイグレーションは初回クエリ時に `aws-blocks/migrations` から一括適用される。
 */
function createBlocksDb(): SqlDatabase {
  const migrationsPath = fileURLToPath(new URL("../../aws-blocks/migrations", import.meta.url));
  const db = new Database(new Scope("rental-space-booking"), "main", { migrationsPath });
  return db as unknown as SqlDatabase;
}
