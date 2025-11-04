# Limitless Todo Bot

Limitless の Lifelogs からタスクを抽出して Slack に通知する常駐ボットです。Railway 上でのデプロイを想定した Node.js (TypeScript) サービスとして実装しています。

## 主要機能
- Limitless API `GET /v1/lifelogs` から最新ログを取得。
- LLM を用いて Todo タスクを抽出し、重複防止用ハッシュを Postgres に保存。
- **NEW**: タスク実行機能 - Zapier MCP 経由で Gmail 操作や検索を自動実行。
- **NEW**: Slack OCR機能 - 絵文字リアクションで画像からテキスト抽出・要約・GitHub保存。
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

- **OpenAI** (推奨): `OPENAI_API_KEY` + `TASK_MODEL_PROVIDER="openai"` + `TASK_MODEL_ID="gpt-4.1"` (最新・最高精度)
- **OpenRouter**: `OPENROUTER_API_KEY` + `TASK_MODEL_PROVIDER="openrouter"` + `TASK_MODEL_ID="x-ai/grok-4-fast"`
- **Anthropic**: `ANTHROPIC_API_KEY` + `TASK_MODEL_PROVIDER="anthropic"` + `TASK_MODEL_ID="claude-3-5-sonnet-20241022"`

### カスタムプロンプト (オプション)
**NEW**: LLMのプロンプトをカスタマイズ可能になりました。

- `TODO_EXTRACTION_PROMPT` - タスク抽出用のカスタムプロンプト
- `TASK_EXECUTION_PROMPT` - タスク実行用のカスタムプロンプト

設定しない場合はデフォルトプロンプトが使用されます。環境変数で自由にカスタマイズできます。

### Perplexity検索 (オプション)
**NEW**: タスクに「調べ」「検索」などのキーワードが含まれる場合、自動的にPerplexity APIで検索を実行します。

- `ENABLE_PERPLEXITY_SEARCH="true"` - Perplexity検索を有効化
- `PERPLEXITY_API_KEY` - Perplexity API キー

検索結果はタスク実行時のコンテキストに自動追加され、精度が向上します。

### Slack OCR機能 (オプション)
**NEW**: Slackで画像に特定の絵文字リアクションをつけると、自動的にOCR処理を実行し、テキスト抽出と要約を行います。

機能概要：
- Slack絵文字リアクションをトリガーとして画像をOCR処理
- Google Cloud Vision APIで高精度なテキスト抽出
- Claude Haiku 4.5で抽出テキストを自動要約
- 結果をGitHubリポジトリに自動保存
- Slackに要約結果を通知

#### 環境変数
- `ENABLE_SLACK_OCR="true"` - Slack OCR機能を有効化
- `SLACK_BOT_TOKEN` - Slack Bot Token (`xoxb-...`形式)
- `SLACK_SIGNING_SECRET` - Slack Signing Secret（セキュリティ検証用）
- `OCR_TRIGGER_EMOJI` - トリガーとなる絵文字名（デフォルト: `memo`）
- `GOOGLE_CLOUD_CREDENTIALS_PATH` - Google Cloud サービスアカウントJSONファイルパス
- `OCR_GITHUB_PATH` - GitHub保存先パス（デフォルト: `ocr_results`）
- `EXPRESS_PORT` - Expressサーバーポート（デフォルト: `3000`）
- `ANTHROPIC_API_KEY` - テキスト要約用（タスク実行機能と共用可能）

#### Slack App設定方法
1. [Slack API](https://api.slack.com/apps) で新規アプリを作成
2. **OAuth & Permissions**:
   - Bot Token Scopes: `channels:history`, `files:read`, `reactions:read`, `users:read`, `channels:read`
   - Install to Workspace → Bot Token (`xoxb-...`) をコピー
3. **Event Subscriptions**:
   - Enable Events: On
   - Request URL: `https://your-railway-domain.railway.app/slack/events`
   - Subscribe to bot events: `reaction_added`
4. **Basic Information**:
   - Signing Secret をコピー
5. 環境変数に設定:
   - `SLACK_BOT_TOKEN`: コピーしたBot Token
   - `SLACK_SIGNING_SECRET`: コピーしたSigning Secret

#### Google Cloud Vision API設定
1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. Vision API を有効化
3. サービスアカウント作成:
   - IAM & Admin → Service Accounts → Create Service Account
   - Role: Cloud Vision API User
   - JSON キーを生成・ダウンロード
4. `GOOGLE_CLOUD_CREDENTIALS_PATH` にJSONファイルパスを設定

#### 使い方
1. Slackで画像を含むメッセージに、設定した絵文字（デフォルト: `:memo:`）でリアクション
2. 自動的にOCR処理が開始されます
3. 数秒後、Slackに要約結果が通知されます
4. 詳細結果はGitHubリポジトリの `ocr_results/` に保存されます

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
- 抽出されたタスクが **Claude Haiku 4.5** により自動的に実行されます
- Anthropic公式のMCP統合機能を使用してZapier MCPに接続
- Zapier MCP 経由で **Gmail 下書き作成、検索、Google Calendar、Notion** などが可能
- MCP接続エラー時の自動リトライ機能（最大3回、指数バックオフ）
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
Limitless API → タスク抽出 (GPT-4.1) → タスク実行エージェント (Claude Haiku 4.5 + Zapier MCP) → Slack レポート通知
```

Claude Haiku 4.5がAnthropic公式のMCP統合を使用し、利用可能な28個のツールを使ってタスクを自動実行します。
MCP接続エラー時は自動的に最大3回リトライ（2秒→5秒→10秒の指数バックオフ）します。

### 日次アーカイブ機能 (オプション)

**NEW**: Limitless Lifelogsを日記形式でGitHubリポジトリにアーカイブできます。

機能概要：
- Lifelogsを時系列でメモリに蓄積
- 毎日23:59にGitHub Issueを作成
- GitHub Actionsが自動的に指定リポジトリの`1.01_Diary/limitless_YYYY-MM-DD.md`にアーカイブ

#### 環境変数
- `ENABLE_DAILY_ARCHIVE="true"` - 日次アーカイブ機能を有効化
- `GITHUB_TOKEN` - GitHub Personal Access Token (`repo`権限が必要)
- `GITHUB_OWNER` - GitHubユーザー名
- `GITHUB_REPO` - アーカイブ先リポジトリ名
- `GITHUB_BRANCH` - ブランチ名（デフォルト: `main`）

#### GitHub Personal Access Tokenの取得
1. GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. "Generate new token (classic)" をクリック
3. 権限: `repo` (Full control of private repositories) にチェック
4. トークンをコピーし `GITHUB_TOKEN` に設定

#### GitHub Actionsの設定
アーカイブ先リポジトリ（例: `yaoo77/obsidian_github`）に以下の設定が必要：

1. **Secretsの追加**:
   - Settings → Secrets and variables → Actions → New repository secret
   - Name: `OBSIDIAN_GITHUB_TOKEN`
   - Value: GitHub Personal Access Token

2. **Actionsの有効化**:
   - 本リポジトリの `.github/workflows/archive-daily-log.yml` がIssue作成時に自動実行されます

#### ログフォーマット例
```markdown
# 2025-11-04 の記録

## 08:30
朝のミーティングで新プロジェクトの話が出た。

## 10:15
1on1ミーティング。進捗報告と来週のスケジュール調整。

---
```

## 今後の TODO
- ブラウザ操作ツールの追加 (browser_use など)
- LLM 応答監査・フォールバック処理の強化
- タスク実行の並列処理最適化
- 失敗通知 (Slack / PagerDuty など) の追加
- タスク実行履歴の保存と分析
- 日次アーカイブのLLM要約機能（事実・会話・感情の抽出）
