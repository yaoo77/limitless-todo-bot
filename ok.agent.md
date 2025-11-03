# limitless_bot 要件メモ

## プロジェクト概要
- **目的**: Limitless の Lifelogs から新規タスクを抽出し、Slack の `#todo-kawase` へレポート投稿する常駐ボットを Railway 上で運用する。
- **稼働形態**: 常駐 Node.js (TypeScript) サービスを Railway にデプロイし、アプリ内で 5 分間隔のポーリングを行う。

## 機能要件
- Limitless API `GET /v1/lifelogs` を利用し、最新 5 件のログを取得。
- 直近処理済み `latest_end_time` 以降のみを対象とする差分処理。
- LLM を用いた Todo 抽出 (出力形式: `{ "tasks": [{ "task": "...", "timestamp": "..." }] }`)。
- タスク重複排除 (`task_hash = SHA256(task_text + timestamp)` など)。
- タスク単位でレポートを生成し、Slack `#todo-kawase` に投稿 (Webhook 優先; Block Kit は任意)。
- 成功時に処理済みメタ情報を更新。エラー時はロギングと再試行 (最小限で可)。

## 非機能要件
- Railway で常時稼働し、5 分以内に新規タスクを通知。
- 環境変数 (API キー類) は Railway Variables 管理。リポジトリには書き込まない。
- ログは Railway の標準ログで確認できる状態にする。
- 初期 KPI: 「新規 Lifelog 発生から Slack 通知まで 5 分以内」「重複通知ゼロ」。

## アーキテクチャ
1. **Scheduler**: `node-cron` で 5 分毎にジョブ起動。
2. **Limitless Client**: `fetch` で `GET /v1/lifelogs` を呼び出し、`includeContents=true` など必要なクエリを付与。
3. **Storage**: Railway Postgres (推奨) に `processed_lifelogs` テーブルを作成し、`lifelog_id`・`latest_end_time`・`task_hash` 等を保存。
4. **Todo Extractor**: OpenRouter / OpenAI 経由の LLM 呼び出し。出力を JSON パース。
5. **Slack Notifier**: Slack Incoming Webhook (または Bolt SDK) を利用してレポート投稿。

## 開発ステップ (想定)
1. Node.js + TypeScript プロジェクト初期化 (`eslint`/`prettier`/`jest` 下地)。
2. DB マイグレーション・接続層実装 (`pg` + `drizzle` / `drizzle-kit`)。
3. Limitless API クライアント実装・単体テスト。
4. Todo 抽出モジュール (LLM ラッパ・プロンプト管理) 実装。
5. Slack 通知フォーマット設計・実装。
6. ポーリングフロー統合 → ローカル検証 → Railway デプロイ。
7. 運用ドキュメント整備 (README, .env.sample, 失敗時の対処)。

## 必要環境変数 (案)
- `LIMITLESS_API_KEY`
- `SLACK_WEBHOOK_URL` (もしくは `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`)
- `OPENROUTER_API_KEY` or `OPENAI_API_KEY`
- `DATABASE_URL` (Railway Postgres)
- `POLL_INTERVAL_MINUTES` (任意。未設定時は5分)
- `LIMITLESS_TIMEZONE` (任意。デフォルトUTC)
- `TASK_MODEL_PROVIDER` (`openrouter` or `openai`)
- `TASK_MODEL_ID` (例: `x-ai/grok-4-fast`, `gpt-4o-mini`)

## ローカル開発コマンド
- `npm install`
- `npm run dev` : `.env` で各種キーを設定したうえでポーリング実行 (RUN_ONCE=true 併用可)
- `npm run build` : TypeScriptビルド
- `npm run lint` : ESLint

### RUN_ONCE 実行例
```bash
LIMITLESS_API_KEY=... SLACK_WEBHOOK_URL=... DATABASE_URL=... RUN_ONCE=true npm run dev
```

## データベース
- テーブル `lifelog_state` : 最新処理済み `latest_end_time` を1レコード保持。
- テーブル `processed_task_hashes` : `lifelog_id` + `task_hash` で一意化し重複通知を防止。
- マイグレーションは `drizzle/` 配下の SQL を Railway Postgres に `npm run db:push` で適用。

## 保留・確認事項
- LLM モデルの優先度 (OpenRouter vs OpenAI)。未決。
- Slack メッセージ詳細レイアウト (Block Kit 採用可否)。
- エラー通知チャネル (必要なら別途 Slack / Email)。

## 次アクション
1. LLM 選定と Slack 通知フォーマットの決定。
2. Node.js プロジェクト初期セットアップ & Postgres スキーマ定義。
3. ローカルで Limitless API 接続検証 (ダミーキーは使用しない)。
4. Railway 上での環境変数設定と初回デプロイ準備。
