# Limitless Todo Bot

Limitless の Lifelogs からタスクを抽出して Slack に通知する常駐ボットです。Railway 上でのデプロイを想定した Node.js (TypeScript) サービスとして実装しています。

## 主要機能
- Limitless API `GET /v1/lifelogs` から最新ログを取得。
- LLM を用いて Todo タスクを抽出し、重複防止用ハッシュを Postgres に保存。
- Slack Webhook を使って `#todo-kawase` など任意チャンネルへレポート投稿。
- 5 分間隔 (デフォルト) のポーリング。`RUN_ONCE=true` で単発実行も可能。

## セットアップ
```bash
npm install
cp .env.example .env  # 必要に応じて作成
```

必要な環境変数:
- `LIMITLESS_API_KEY`
- `SLACK_WEBHOOK_URL`
- `DATABASE_URL`
- `OPENROUTER_API_KEY` または `OPENAI_API_KEY`
- `POLL_INTERVAL_MINUTES` (任意、デフォルト 5)
- `LIMITLESS_TIMEZONE` (任意、デフォルト UTC)
- `TASK_MODEL_PROVIDER` (`openrouter` または `openai`)
- `TASK_MODEL_ID` (例: `x-ai/grok-4-fast`)

## 開発コマンド
- `npm run dev` : tsx でローカル実行。`.env` を読み込む場合は `dotenv-cli` などを併用。
- `RUN_ONCE=true npm run dev` : 単発実行して処理結果を確認。
- `npm run build` : TypeScript を `dist/` にビルド。
- `npm run lint` : ESLint。
- `npm run db:generate` : Drizzle スキーマから SQL マイグレーションを生成。
- `npm run db:push` : 生成済みマイグレーションを DB に適用。
- `npm run db:studio` : Drizzle Studio を起動（接続先: `DATABASE_URL`）。

## データベース
- `lifelog_state` テーブルで最新処理済みの `latest_end_time` を保持。
- `processed_task_hashes` テーブルで `lifelog_id` と `task_hash` の組を保存し重複通知を防止。
- `drizzle/` 以下に Drizzle 生成済みマイグレーションを格納。
- 新しいカラム・テーブル追加時は `npm run db:generate` → `npm run db:push` の順に実行。

## デプロイ (Railway想定)
1. Railway の新規プロジェクトを作成し、リポジトリを接続。
2. Variables に上記環境変数を登録。
3. Postgres アドオンを追加し、`DATABASE_URL` を設定。
4. スタートコマンドを `npm run start` に設定。
5. Railway の「Jobs (Cron)」を使う場合は 5 分毎のジョブを追加するか、常駐プロセスとして稼働させる。

## 今後の TODO
- Drizzle マイグレーションの追加。
- LLM 応答監査・フォールバック処理。
- Slack Block Kit の詳細調整。
- 失敗通知 (Slack / PagerDuty など) の追加。
