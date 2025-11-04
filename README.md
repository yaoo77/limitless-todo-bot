# Limitless Todo Bot

Limitless の Lifelogs からタスクを抽出して Slack に通知する常駐ボットです。Railway 上でのデプロイを想定した Node.js (TypeScript) サービスとして実装しています。

## 主要機能
- Limitless API `GET /v1/lifelogs` から最新ログを取得。
- LLM を用いて Todo タスクを抽出し、重複防止用ハッシュを Postgres に保存。
- **NEW**: タスク実行機能 - Zapier MCP 経由で Gmail 操作や検索を自動実行。
- Slack Webhook を使って `#todo-kawase` など任意チャンネルへレポート投稿。
- 5 分間隔 (デフォルト) のポーリング。`RUN_ONCE=true` で単発実行も可能。

## セットアップ
```bash
npm install
cp .env.example .env  # 必要に応じて作成
```

必要な環境変数:
- `LIMITLESS_API_KEY` - Limitless API キー
- `SLACK_WEBHOOK_URL` - Slack Webhook URL
- `DATABASE_URL` - PostgreSQL 接続URL
- `POLL_INTERVAL_MINUTES` (任意、デフォルト 5) - ポーリング間隔
- `LIMITLESS_TIMEZONE` (任意、デフォルト UTC) - タイムゾーン

### タスク抽出用 LLM 設定
以下のいずれかを選択：

- **OpenRouter**: `OPENROUTER_API_KEY` + `TASK_MODEL_PROVIDER="openrouter"` + `TASK_MODEL_ID="x-ai/grok-4-fast"`
- **OpenAI**: `OPENAI_API_KEY` + `TASK_MODEL_PROVIDER="openai"` + `TASK_MODEL_ID="gpt-4-turbo-2024-04-09"` (推奨: GPT-4 Turbo)
- **Anthropic**: `ANTHROPIC_API_KEY` + `TASK_MODEL_PROVIDER="anthropic"` + `TASK_MODEL_ID="claude-3-5-sonnet-20241022"`

### タスク実行機能 (オプション)
タスク実行機能を有効にする場合、追加で以下の環境変数が必要です：

- `ENABLE_TASK_EXECUTION="true"` - タスク実行機能を有効化
- `ANTHROPIC_API_KEY` - Anthropic Claude API キー (タスク実行エージェント用)
- `ZAPIER_MCP_URL="https://mcp.zapier.com/api/mcp/mcp"` - Zapier MCP エンドポイント
- `ZAPIER_MCP_API_KEY` - Zapier MCP API キー

#### Zapier MCP API キーの取得方法
1. [Zapier MCP 設定ページ](https://mcp.zapier.com/) にアクセス
2. **Anthropic API MCP Server** タブを選択（プログラム用）
3. 表示される API キーをコピー
4. 環境変数 `ZAPIER_MCP_API_KEY` に設定

**注意**: Claude Code用やclaude.ai用のAPIキーではなく、**Anthropic API MCP Server**のキーを使用してください。

タスク実行機能を使用すると：
- 抽出されたタスクが **Claude 4.5 Haiku** により自動的に実行されます
- Anthropic公式のMCP統合機能を使用してZapier MCPに接続
- Zapier MCP 経由で **Gmail 下書き作成、検索、Google Calendar、Notion** などが可能
- 実行結果が Slack に詳細レポートとして投稿されます

#### 利用可能なツール (28個)
- **Gmail**: 下書き作成、検索、送信、返信
- **Google Calendar**: イベント作成、検索、更新
- **Google Drive**: ファイル検索、アップロード、フォルダ作成
- **Notion**: ページ取得、データベース検索
- **Zoom**: ミーティング作成、録画検索

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

## アーキテクチャ

### 基本フロー
```
Limitless API → タスク抽出 (LLM) → Slack 通知
```

### タスク実行機能有効時
```
Limitless API → タスク抽出 (GPT-4 Turbo) → タスク実行エージェント (Claude 4.5 Haiku + Zapier MCP) → Slack レポート通知
```

Claude 4.5 HaikuがAnthropic公式のMCP統合を使用し、利用可能な28個のツールを使ってタスクを自動実行します。

## 今後の TODO
- ブラウザ操作ツールの追加 (browser_use など)
- LLM 応答監査・フォールバック処理の強化
- タスク実行の並列処理最適化
- 失敗通知 (Slack / PagerDuty など) の追加
- タスク実行履歴の保存と分析
