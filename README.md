# rental-space-booking

レンタルスペース予約システムを題材に、**TypeScript でドメイン駆動設計（DDD）** を実装する学習用リポジトリ。

## 目的

DDD の主要パターン（値オブジェクト・エンティティ・集約・ドメインサービス・リポジトリ・ドメインイベント・仕様）を、
「ダブルブッキング禁止」「営業時間内のみ予約可」「キャンセルポリシー」「時間帯別料金」といった
実際の業務ロジックに紐づけて実装する。

## 実装スコープ

設計書（`docs/design/rental-space-booking.md`）に沿って、ヘキサゴナル（ポート＆アダプタ）の
コア全層を実装済み。

- **コンテキスト**: 予約（Booking, コアドメイン）／スペース管理（Space）／利用者・認証（Customer）／
  決済・通知（汎用サブドメイン: ポート＋モックアダプタ）。
- **永続化**: インメモリ実装が主軸（`InMemory*Repository`）。占有一意性（ダブルブッキング防止）は
  リポジトリ層の同期 check-and-set で強制（ADR-002/003）。RDS 実装は将来拡張。
- **UI(React)は対象外**: ドメイン/アプリ/インフラ層と合成ルート・シード・コンソールデモまで。
  UI はアプリケーションサービスを呼ぶだけの層であり、本リポジトリのスタック（純TS/Vitest）では未実装。

主要フローは `npm run demo` でコンソール確認できる（NFR-004）。

## アーキテクチャ方針

依存方向は常に **外側 → 内側**。ドメイン層は何にも依存しない純粋な TypeScript で記述する。

```
infrastructure  →  application  →  domain
   (DB実装/外部API)   (ユースケース)     (値オブジェクト/エンティティ/集約/ドメインサービス)
```

## 開発ワークフロー

要件 → 設計 → 実装 の順を守る。

| フェーズ | 成果物 |
| --- | --- |
| 要件定義 | `docs/requirements/<機能名スラッグ>.md` |
| 設計 | `docs/design/<機能名スラッグ>.md`（Mermaid 図・ADR 付き） |
| 実装 | `src/` |

## セットアップ

```bash
npm install
```

## よく使うコマンド

```bash
npm run typecheck   # 型チェック（backend / ui の2パス, ADR-F05）
npm test            # テスト実行（Vitest）
npm run test:watch  # テスト watch
npm run demo        # 主要フローのコンソールデモ（tsx src/main.ts）
npm run dev         # フロント（Vite + React SPA）を起動
npm run build:web   # フロントの本番ビルド（vite build）
```

## フロントエンド

ゲスト予約フロー中心の React SPA（`src/ui/`）。ブラウザ内から既存のアプリケーション
サービス（`composition/createWebApp`）を直接呼ぶ（HTTPサーバなし）。要件は
`docs/requirements/rental-space-booking-frontend.md`、設計は
`docs/design/rental-space-booking-frontend.md` を参照。`npm run dev` で起動。

## AWS Blocks バックエンド（段階移行中）

インメモリ/モック実装を、ポートはそのままに [AWS Blocks](https://aws.amazon.com/products/developer-tools/blocks/)
製の実アダプタへ段階的に置き換える取り組みを進めている（トラッキング: Issue #16）。

- **方針**: ドメイン層（純TS / DDD の核）は一切触らず、`src/contexts/*/infrastructure/` と
  `src/composition/` だけで差し替える。インメモリ実装は削除せず共存させる（テスト・学習用）。
- **切替シーム**: `createContainer({ backend })` で実装系統を選ぶ。`"memory"`（既定）は従来どおり。
  `"blocks"` は移行済みコンテキストのみ実アダプタに載せ替える。顧客は #10 までインメモリのまま
  （移行途中の混在を許容, ADR-AB05）。
- **実装状況**:
  - ✅ #8 予約リポジトリ → Database 実装（Postgres / ローカルは PGlite）。複合PKでダブルブッキングを物理強制。
  - ✅ #9 スペースリポジトリ → Database 実装（予約と同一 DB を共有）。
  - ✅ #11 通知 → Email Block（SES）。確定/キャンセル/リマインドを送信（`SesNotificationAdapter`）。
    実宛先は `EmailRecipientResolver` で送信直前にのみ解決し、生 PII をログ・公開コードに出さない（NFR-002, ADR-AB06）。
    ローカルは Email Block のモックで外部送信なし。デモ用の送信ログ（Mock）は `TeeNotificationAdapter` で温存。
  - ⬜ #10 認証 / #12 リマインド(cron) / #13 ジョブ / #14 決済 / #15 フロント結線。Real-time messaging は #11 の任意分として後続。
- **非同期ポート**: リポジトリポート／通知ポートは async（Promise）化済み。設計は `docs/design/aws-blocks-async-ports.md`。
  通知は EventBus を同期に保ち購読側を fire-and-forget で呼ぶ（結果整合, ADR-AB06）。
- **アプリ境界**: `aws-blocks/index.ts` に Blocks アプリの `Scope` と型付き RPC の入口を定義。
  各 Building Block（Database / Cognito / SES / Realtime / CronJob / AsyncJob）はここに足していく。

```bash
npm run dev:blocks   # AWS Blocks ローカル開発サーバ（モック実装・AWSアカウント不要）
npm run typecheck    # backend / ui / aws-blocks の3パス型チェック
```

> AWS Blocks は Preview。ローカル開発はモックで完結し AWS アカウント不要だが、本番採用は時期尚早。
> README の「RDS 実装は将来拡張」スロットに位置づけている。

## 技術スタック

- TypeScript 5.x（strict + 追加の厳格フラグ）
- React 19 + Vite（フロントエンド SPA）
- Vitest（テスト）
- tsx（TS 直接実行）
- Node.js 20+
