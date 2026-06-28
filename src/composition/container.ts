import type { Clock } from "../shared/domain/Clock.js";
import { SystemClock } from "../shared/domain/Clock.js";
import { InMemoryEventBus, type EventBus } from "../shared/domain/EventBus.js";

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
import type { ReservationRepository } from "../contexts/booking/domain/ports/ReservationRepository.js";
import type { ReminderLog } from "../contexts/booking/application/ports/ReminderLog.js";
import { InMemoryReminderLog } from "../contexts/booking/infrastructure/InMemoryReminderLog.js";

// Space
import { EditSpace } from "../contexts/space/application/EditSpace.js";
import { GetSpaceDetail } from "../contexts/space/application/GetSpaceDetail.js";
import { ListSpaces } from "../contexts/space/application/ListSpaces.js";
import { RegisterSpace } from "../contexts/space/application/RegisterSpace.js";
import { ResumeSpace } from "../contexts/space/application/ResumeSpace.js";
import { SpaceCatalogQueryService } from "../contexts/space/application/SpaceCatalogQueryService.js";
import { SuspendSpace } from "../contexts/space/application/SuspendSpace.js";
import { InMemorySpaceRepository } from "../contexts/space/infrastructure/InMemorySpaceRepository.js";
import type { SpaceRepository } from "../contexts/space/domain/ports/SpaceRepository.js";

// Customer
import { CustomerDirectoryService } from "../contexts/customer/application/CustomerDirectoryService.js";
import { Login } from "../contexts/customer/application/Login.js";
import { RegisterMember } from "../contexts/customer/application/RegisterMember.js";
import type { AuthGateway } from "../contexts/customer/application/ports/AuthGateway.js";
import type { CustomerRepository } from "../contexts/customer/domain/ports/CustomerRepository.js";
import { InMemoryCustomerRepository } from "../contexts/customer/infrastructure/InMemoryCustomerRepository.js";
import { InMemoryAuthGateway } from "../contexts/customer/infrastructure/InMemoryAuthGateway.js";

// Payment / Notification
import type { NotificationPort } from "../contexts/booking/application/ports/NotificationPort.js";
import { MockNotificationAdapter } from "../contexts/notification/infrastructure/MockNotificationAdapter.js";
import { MockPaymentAdapter } from "../contexts/payment/infrastructure/MockPaymentAdapter.js";
import {
  StripePaymentAdapter,
  type StripeGateway,
} from "../contexts/payment/infrastructure/StripePaymentAdapter.js";
import type { PaymentPort } from "../contexts/booking/application/ports/PaymentPort.js";

/**
 * backend に応じて差し替わるインフラ一式（リポジトリ/イベントバス/認証/通知, ADR-AB03）。
 * memory は本ファイルでインライン構築、blocks は `blocksWiring.buildBlocksInfra` が構築して注入する
 * （`@aws-blocks/*`=Node 専用 をブラウザバンドルから隔離するため, #6 / ADR-AB11）。
 */
export type BackendInfra = {
  readonly bus: EventBus;
  readonly spaces: SpaceRepository;
  readonly reservations: ReservationRepository;
  readonly reminderLog: ReminderLog;
  /** 顧客プロフィール（backend に応じてインメモリ or AWS Blocks Database 実装, §9#5）。 */
  readonly customers: CustomerRepository;
  readonly auth: AuthGateway;
  /** デモ/テスト用 introspection（sent/clear）を保持するモック通知。常に公開する。 */
  readonly notifier: MockNotificationAdapter;
  /** 実際の購読先（memory=Mock のみ / blocks=SES＋Mock の Tee）。 */
  readonly notifyPort: NotificationPort;
};

export type Container = {
  readonly clock: Clock;
  readonly bus: EventBus;
  readonly payment: MockPaymentAdapter;
  readonly notifier: MockNotificationAdapter;
  readonly catalog: SpaceCatalogPort;
  readonly directory: CustomerDirectoryPort;
  /** スペースリポジトリ（backend に応じてインメモリ or AWS Blocks 実装。ADR-AB03）。 */
  readonly spaces: SpaceRepository;
  /** 顧客プロフィールリポジトリ（backend に応じてインメモリ or AWS Blocks 実装, §9#5）。 */
  readonly customers: CustomerRepository;
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
 * - "blocks": AWS Blocks ベースの実装（`blocksInfra` を注入）。
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
   */
  readonly paymentGateway?: StripeGateway;
  /**
   * blocks バックエンドの AWS Blocks リソース境界名（既定 "rental-space-booking"）。
   * `createWebApp({ backend: "blocks" })` が `buildBlocksInfra` へ渡す。テストで一意名を与えると隔離できる。
   */
  readonly blocksScopeId?: string;
  /**
   * blocks バックエンドのインフラ一式（`blocksWiring.buildBlocksInfra` 製）。`backend: "blocks"` で必須。
   * `@aws-blocks/*` をブラウザバンドルから隔離するため、構築は本ファイル外（動的 import）で行う（#6）。
   */
  readonly blocksInfra?: BackendInfra;
};

/** memory バックエンドの backend 依存インフラをインライン構築する（`@aws-blocks/*` 非依存）。 */
function buildMemoryInfra(silentNotifications: boolean): BackendInfra {
  const customers = new InMemoryCustomerRepository();
  const notifier = new MockNotificationAdapter(!silentNotifications);
  return {
    bus: new InMemoryEventBus(),
    spaces: new InMemorySpaceRepository(),
    reservations: new InMemoryReservationRepository(),
    reminderLog: new InMemoryReminderLog(),
    customers,
    auth: new InMemoryAuthGateway(customers),
    notifier,
    notifyPort: notifier,
  };
}

/**
 * 合成ルート（DI）。ポート↔実装の束ね（NFR-006）。
 *
 * memory（既定）は本ファイルでインライン構築し `@aws-blocks/*` に一切依存しない（ブラウザSPAで安全, #6）。
 * blocks は `options.blocksInfra`（`buildBlocksInfra` 製）を注入する。`createWebApp({ backend: "blocks" })`
 * が動的 import で構築・注入するため、通常は本関数を直接 blocks で呼ぶ必要はない。
 */
export function createContainer(options: ContainerOptions = {}): Container {
  const backend: AppBackend = options.backend ?? "memory";
  const clock: Clock = options.clock ?? new SystemClock();

  const infra: BackendInfra =
    backend === "blocks"
      ? requireBlocksInfra(options.blocksInfra)
      : buildMemoryInfra(options.silentNotifications ?? false);

  const { bus, spaces, reservations, reminderLog, customers, auth, notifier, notifyPort } = infra;

  // 汎用サブドメイン（モックアダプタ）。payment はデモ/テスト用の introspection（setBehavior 等）を
  // 維持するため常に Mock を公開し、実決済の経路だけ paymentGateway 指定時に Stripe 実装へ差し替える（#14）。
  const payment = new MockPaymentAdapter();
  const paymentPort: PaymentPort = options.paymentGateway
    ? new StripePaymentAdapter(options.paymentGateway)
    : payment;

  // Booking ポートの実装供給（依存性逆転）
  const catalog: SpaceCatalogPort = new SpaceCatalogQueryService(spaces);
  const directory: CustomerDirectoryPort = new CustomerDirectoryService(customers);

  // 通知購読（Booking → Notification, 結果整合）。
  new NotificationHandlers(notifyPort, directory).register(bus);

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

function requireBlocksInfra(infra: BackendInfra | undefined): BackendInfra {
  if (!infra) {
    throw new Error(
      'backend: "blocks" には blocksInfra が必要です。' +
        "createWebApp({ backend: \"blocks\" }) を使うか、blocksWiring.buildBlocksInfra() で構築して渡してください（#6）。",
    );
  }
  return infra;
}
