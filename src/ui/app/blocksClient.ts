import type {
  AdminApi,
  AppError,
  AppServices,
  PaymentBehavior,
  UiResult,
} from "../../composition/webFacade.js";

/**
 * AWS Blocks 型安全クライアント越しに呼ぶ予約フロー RPC（`aws-blocks/index.ts` の `app` namespace と同型）。
 * `AppServices` から UI ローカル専用/同期のデモ操作（`admin` / `setPaymentBehavior` / `notifications`）を除いたもの。
 * `notifications` はモック通知ログの同期参照（ADR-F04）で、リモートバックエンドには載せない。
 */
export type BookingRpc = Omit<AppServices, "admin" | "setPaymentBehavior" | "notifications">;

/** 管理者 RPC（`aws-blocks/index.ts` の `admin` namespace と同型）。 */
export type AdminRpc = AdminApi;

/** 型付きクライアント（`import { app, admin } from "aws-blocks"`）の構造。テストでは fake を注入する。 */
export type BlocksClient = {
  readonly app: BookingRpc;
  readonly admin: AdminRpc;
};

/** RPC 呼び出しの想定外失敗（ネットワーク/サーバ例外）を UiResult のエラーへ写像する（#15 スコープ）。 */
const toUiError = (e: unknown): { readonly ok: false; readonly error: AppError } => ({
  ok: false,
  error: {
    kind: "IllegalState",
    message: e instanceof Error ? e.message : "バックエンドとの通信に失敗しました",
  },
});

/** UiResult を返す RPC をラップし、例外時は UiResult のエラーへ変換する。 */
const guard = async <T>(call: () => Promise<UiResult<T>>): Promise<UiResult<T>> => {
  try {
    return await call();
  } catch (e) {
    return toUiError(e);
  }
};

/**
 * AWS Blocks 型安全クライアントを `AppServices` ファサードへ適合させる（#15, ADR-AB11）。
 * UI ページ群は `AppServices` のまま実バックエンドへ繋がる（ページ無変更）。
 * 業務エラーはサーバが `UiResult` で返し、想定外例外のみ本層で `UiResult` のエラーへ写像する。
 */
export function createBlocksAppServices(client: BlocksClient): AppServices {
  const { app, admin } = client;
  return {
    // 参照系（配列）は素通し（失敗時は reject させ、呼び出し側のローディング/握りで扱う）。
    listSpaces: () => app.listSpaces(),
    listMyReservations: (memberId) => app.listMyReservations(memberId),
    triggerReminders: () => app.triggerReminders(),

    // モック通知ログの同期参照（ADR-F04）はリモートバックエンドでは提供しない（空配列）。
    notifications: () => [],

    // UiResult 系は想定外例外も UiResult エラーへ写像する。
    searchAvailability: (spaceId, fromDayIso, toDayIso) =>
      guard(() => app.searchAvailability(spaceId, fromDayIso, toDayIso)),
    quote: (spaceId, slotEpochs) => guard(() => app.quote(spaceId, slotEpochs)),
    place: (args) => guard(() => app.place(args)),
    lookup: (reservationNumber, email) => guard(() => app.lookup(reservationNumber, email)),
    cancel: (reservationId, email) => guard(() => app.cancel(reservationId, email)),
    registerMember: (input) => guard(() => app.registerMember(input)),
    login: (loginId, secret) => guard(() => app.login(loginId, secret)),

    // 決済挙動の切替はモック専用のデモ操作。実バックエンドでは no-op（FR 外, ADR-F04）。
    setPaymentBehavior: (_behavior: PaymentBehavior) => {},

    admin: {
      listSpaces: (session) => admin.listSpaces(session),
      getSpaceDetail: (session, spaceId) => guard(() => admin.getSpaceDetail(session, spaceId)),
      registerSpace: (session, form) => guard(() => admin.registerSpace(session, form)),
      editSpace: (session, spaceId, form) => guard(() => admin.editSpace(session, spaceId, form)),
      suspendSpace: (session, spaceId) => guard(() => admin.suspendSpace(session, spaceId)),
      resumeSpace: (session, spaceId) => guard(() => admin.resumeSpace(session, spaceId)),
      listReservations: (session, filter) => guard(() => admin.listReservations(session, filter)),
      forceCancel: (session, reservationId, overrideZeroRate) =>
        guard(() => admin.forceCancel(session, reservationId, overrideZeroRate)),
      markNoShow: (session, reservationId) => guard(() => admin.markNoShow(session, reservationId)),
    },
  };
}
