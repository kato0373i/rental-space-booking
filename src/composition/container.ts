import { fileURLToPath } from "node:url";
import { Scope } from "@aws-blocks/core";
import { Database } from "@aws-blocks/blocks";
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
import type { CustomerDirectoryPort } from "../contexts/booking/application/ports/CustomerDirectoryPort.js";
import type { SpaceCatalogPort } from "../contexts/booking/application/ports/SpaceCatalogPort.js";
import { InMemoryReservationRepository } from "../contexts/booking/infrastructure/InMemoryReservationRepository.js";
import {
  BlocksReservationRepository,
  type SqlDatabase,
} from "../contexts/booking/infrastructure/BlocksReservationRepository.js";
import type { ReservationRepository } from "../contexts/booking/domain/ports/ReservationRepository.js";

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
import { LoginMock } from "../contexts/customer/application/LoginMock.js";
import { RegisterMember } from "../contexts/customer/application/RegisterMember.js";
import { InMemoryCustomerRepository } from "../contexts/customer/infrastructure/InMemoryCustomerRepository.js";

// Payment / Notification
import { MockNotificationAdapter } from "../contexts/notification/infrastructure/MockNotificationAdapter.js";
import { MockPaymentAdapter } from "../contexts/payment/infrastructure/MockPaymentAdapter.js";

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
  // Space ユースケース
  readonly registerSpace: RegisterSpace;
  readonly editSpace: EditSpace;
  readonly suspendSpace: SuspendSpace;
  readonly resumeSpace: ResumeSpace;
  readonly listSpaces: ListSpaces;
  readonly getSpaceDetail: GetSpaceDetail;
  // Customer ユースケース
  readonly registerMember: RegisterMember;
  readonly loginMock: LoginMock;
  /** 管理者として扱う loginId 集合（シードが登録, FR-042）。LoginMock と共有。 */
  readonly adminLoginIds: Set<string>;
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
  const bus = new InMemoryEventBus();

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

  // 汎用サブドメイン（モックアダプタ）
  const payment = new MockPaymentAdapter();
  const notifier = new MockNotificationAdapter(!options.silentNotifications);

  // Booking ポートの実装供給（依存性逆転）
  const catalog: SpaceCatalogPort = new SpaceCatalogQueryService(spaces);
  const directory: CustomerDirectoryPort = new CustomerDirectoryService(customers);

  // 通知購読（Booking → Notification, 結果整合）
  new NotificationHandlers(notifier, directory).register(bus);

  // 管理者 loginId 集合（シードが登録）。LoginMock と共有して Admin ロールを判定（B-1）。
  const adminLoginIds = new Set<string>();

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
    placeReservation: new PlaceReservation(catalog, directory, reservations, payment, bus, clock),
    cancelReservation: new CancelReservation(reservations, payment, bus, clock, directory),
    lookupReservation: new LookupReservation(reservations, directory, clock),
    listMyReservations: new ListMyReservations(reservations, clock),
    forceCancelReservation: new ForceCancelReservation(reservations, payment, bus, clock),
    markNoShow: new MarkNoShow(reservations, clock),
    listAllReservations: new ListAllReservations(reservations, clock),
    triggerReminders: new TriggerReminders(reservations, bus),
    registerSpace: new RegisterSpace(spaces),
    editSpace: new EditSpace(spaces),
    suspendSpace: new SuspendSpace(spaces),
    resumeSpace: new ResumeSpace(spaces),
    listSpaces: new ListSpaces(spaces),
    getSpaceDetail: new GetSpaceDetail(spaces),
    registerMember: new RegisterMember(customers),
    loginMock: new LoginMock(customers, adminLoginIds),
    adminLoginIds,
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
