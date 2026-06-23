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

// Space
import { EditSpace } from "../contexts/space/application/EditSpace.js";
import { RegisterSpace } from "../contexts/space/application/RegisterSpace.js";
import { ResumeSpace } from "../contexts/space/application/ResumeSpace.js";
import { SpaceCatalogQueryService } from "../contexts/space/application/SpaceCatalogQueryService.js";
import { SuspendSpace } from "../contexts/space/application/SuspendSpace.js";
import { InMemorySpaceRepository } from "../contexts/space/infrastructure/InMemorySpaceRepository.js";

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
  readonly spaces: InMemorySpaceRepository;
  readonly customers: InMemoryCustomerRepository;
  readonly reservations: InMemoryReservationRepository;
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
  // Customer ユースケース
  readonly registerMember: RegisterMember;
  readonly loginMock: LoginMock;
};

export type ContainerOptions = {
  readonly clock?: Clock;
  /** 通知のコンソール出力を抑制する（テスト時 true）。 */
  readonly silentNotifications?: boolean;
};

/**
 * 合成ルート（DI）。ポート↔実装の束ね（インメモリ/RDS 切替点, NFR-006）。
 * 別のリポジトリ実装（RDS）へ差し替える場合、ここの new を差し替えるだけでよい。
 */
export function createContainer(options: ContainerOptions = {}): Container {
  const clock: Clock = options.clock ?? new SystemClock();
  const bus = new InMemoryEventBus();

  // リポジトリ（インメモリ実装）
  const spaces = new InMemorySpaceRepository();
  const customers = new InMemoryCustomerRepository();
  const reservations = new InMemoryReservationRepository();

  // 汎用サブドメイン（モックアダプタ）
  const payment = new MockPaymentAdapter();
  const notifier = new MockNotificationAdapter(!options.silentNotifications);

  // Booking ポートの実装供給（依存性逆転）
  const catalog: SpaceCatalogPort = new SpaceCatalogQueryService(spaces);
  const directory: CustomerDirectoryPort = new CustomerDirectoryService(customers);

  // 通知購読（Booking → Notification, 結果整合）
  new NotificationHandlers(notifier, directory).register(bus);

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
    registerMember: new RegisterMember(customers),
    loginMock: new LoginMock(customers),
  };
}
