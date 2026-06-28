// AWS Blocks アプリ定義（バックエンドのリソース境界 ＝ デプロイの合成ルート）。
//
// dev サーバ（`npm run dev:blocks`）／sandbox／deploy は、いずれもこの
// `aws-blocks/index.ts` を入口に読む。#7 ではここを「土台のみ」とし src へは依存させなかったが、
// #15（フロントエンド統合）でアプリ層を**型安全 RPC として公開する合成ルート**へ昇格させる
// （ADR-AB11）。型付きクライアント（`import { app } from "aws-blocks"`）から DTO/プリミティブだけを
// 授受し、UI ページは `AppServices` ファサードのまま実バックエンドへ繋がる。
import { ApiNamespace, Scope } from "@aws-blocks/core";
import { createWebApp, type AppServices } from "../src/composition/webFacade.js";

/** このアプリのリソース境界（NFR-006 のインメモリ/RDS 切替点の Blocks 版）。 */
export const scope = new Scope("rental-space-booking");

/**
 * 永続バックエンド（AWS Blocks Database/Cognito/SES/Jobs）を1度だけ構築して共有する。
 * Database は永続（ローカル PGlite / デプロイ Aurora）のため、リロード・複数クライアントで
 * データを共有できる（#15 完了条件）。シードは初回のみ（`createWebApp` が冪等判定）。
 */
let appPromise: Promise<AppServices> | undefined;
const getApp = (): Promise<AppServices> => (appPromise ??= createWebApp({ backend: "blocks" }));

/**
 * 疎通確認用の最小 RPC。型付きクライアントの“通り道”を保証する（公開エンドポイント）。
 */
export const health = new ApiNamespace(scope, "health", () => ({
  async ping() {
    return { status: "ok" as const, at: new Date().toISOString() };
  },
}));

/**
 * ゲスト/会員向けの予約フロー RPC（#15）。各メソッドは `AppServices` に委譲する。
 * 認証ゲートは付けず（既存 UI 互換）、認可は管理者操作のみ `AppServices` 内部の `requireAdmin` が担う
 * （ADR-AD01）。実フローのセッション連携・gating の厳格化はデプロイ時に `auth` Block で重ねる。
 */
export const app = new ApiNamespace(scope, "app", () => ({
  listSpaces: async () => (await getApp()).listSpaces(),
  searchAvailability: async (spaceId: string, fromDayIso: string, toDayIso: string) =>
    (await getApp()).searchAvailability(spaceId, fromDayIso, toDayIso),
  quote: async (spaceId: string, slotEpochs: readonly number[]) =>
    (await getApp()).quote(spaceId, slotEpochs),
  place: async (args: Parameters<AppServices["place"]>[0]) => (await getApp()).place(args),
  lookup: async (reservationNumber: string, email: string) =>
    (await getApp()).lookup(reservationNumber, email),
  cancel: async (reservationId: string, email: string) =>
    (await getApp()).cancel(reservationId, email),
  listMyReservations: async (memberId: string) => (await getApp()).listMyReservations(memberId),
  registerMember: async (input: Parameters<AppServices["registerMember"]>[0]) =>
    (await getApp()).registerMember(input),
  login: async (loginId: string, secret: string) => (await getApp()).login(loginId, secret),
  triggerReminders: async () => (await getApp()).triggerReminders(),
}));

/**
 * 管理者向け RPC（#15）。認可は各操作で `session` のロールから Actor を構築し `requireAdmin` が強制する
 * （ADR-AD01）。デプロイ時は Cognito グループ等でエンドポイント自体も gating する。
 */
export const admin = new ApiNamespace(scope, "admin", () => ({
  listSpaces: async (session: Parameters<AppServices["admin"]["listSpaces"]>[0]) =>
    (await getApp()).admin.listSpaces(session),
  getSpaceDetail: async (
    session: Parameters<AppServices["admin"]["getSpaceDetail"]>[0],
    spaceId: string,
  ) => (await getApp()).admin.getSpaceDetail(session, spaceId),
  registerSpace: async (
    session: Parameters<AppServices["admin"]["registerSpace"]>[0],
    form: Parameters<AppServices["admin"]["registerSpace"]>[1],
  ) => (await getApp()).admin.registerSpace(session, form),
  editSpace: async (
    session: Parameters<AppServices["admin"]["editSpace"]>[0],
    spaceId: string,
    form: Parameters<AppServices["admin"]["editSpace"]>[2],
  ) => (await getApp()).admin.editSpace(session, spaceId, form),
  suspendSpace: async (
    session: Parameters<AppServices["admin"]["suspendSpace"]>[0],
    spaceId: string,
  ) => (await getApp()).admin.suspendSpace(session, spaceId),
  resumeSpace: async (
    session: Parameters<AppServices["admin"]["resumeSpace"]>[0],
    spaceId: string,
  ) => (await getApp()).admin.resumeSpace(session, spaceId),
  listReservations: async (
    session: Parameters<AppServices["admin"]["listReservations"]>[0],
    filter: Parameters<AppServices["admin"]["listReservations"]>[1],
  ) => (await getApp()).admin.listReservations(session, filter),
  forceCancel: async (
    session: Parameters<AppServices["admin"]["forceCancel"]>[0],
    reservationId: string,
    overrideZeroRate: boolean,
  ) => (await getApp()).admin.forceCancel(session, reservationId, overrideZeroRate),
  markNoShow: async (
    session: Parameters<AppServices["admin"]["markNoShow"]>[0],
    reservationId: string,
  ) => (await getApp()).admin.markNoShow(session, reservationId),
}));
