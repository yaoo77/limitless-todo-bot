import { z } from 'zod';

const configSchema = z.object({
  limitlessApiKey: z.string().min(1),
  slackWebhookUrl: z.string().url(),
  pollIntervalMinutes: z.coerce.number().default(5),
  timezone: z.string().default('UTC'),
  taskModelProvider: z.enum(['openrouter', 'openai', 'anthropic']).default('openrouter'),
  taskModelId: z.string().default('x-ai/grok-4-fast'),
  openRouterApiKey: z.string().optional(),
  openAiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  enableTaskExecution: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  zapierMcpUrl: z.string().url().optional(),
  zapierMcpApiKey: z.string().optional(),
  // Daily Archive機能
  enableDailyArchive: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  githubToken: z.string().optional(),
  githubOwner: z.string().optional(),
  githubRepo: z.string().optional(),
  githubBranch: z.string().default('main'),
  // Custom Prompts
  todoExtractionPrompt: z.string().optional(),
  taskExecutionPrompt: z.string().optional(),
  // Perplexity API
  perplexityApiKey: z.string().optional(),
  enablePerplexitySearch: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  // Slack OCR機能
  enableSlackOcr: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  slackBotToken: z.string().optional(),
  slackSigningSecret: z.string().optional(),
  ocrTriggerEmoji: z.string().default('memo'), // トリガーとなる絵文字名
  googleCloudCredentialsPath: z.string().optional(), // GCPサービスアカウントJSONファイルパス
  ocrGithubPath: z.string().default('ocr_results'), // GitHub保存先パス
  expressPort: z.coerce.number().default(3000), // Expressサーバーポート
});

export type AppConfig = z.infer<typeof configSchema>;

let cachedConfig: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = configSchema.parse({
    limitlessApiKey: process.env.LIMITLESS_API_KEY,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    pollIntervalMinutes: process.env.POLL_INTERVAL_MINUTES,
    timezone: process.env.LIMITLESS_TIMEZONE,
    taskModelProvider: process.env.TASK_MODEL_PROVIDER,
    taskModelId: process.env.TASK_MODEL_ID,
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    openAiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    enableTaskExecution: process.env.ENABLE_TASK_EXECUTION,
    zapierMcpUrl: process.env.ZAPIER_MCP_URL,
    zapierMcpApiKey: process.env.ZAPIER_MCP_API_KEY,
    enableDailyArchive: process.env.ENABLE_DAILY_ARCHIVE,
    githubToken: process.env.GITHUB_TOKEN,
    githubOwner: process.env.GITHUB_OWNER,
    githubRepo: process.env.GITHUB_REPO,
    githubBranch: process.env.GITHUB_BRANCH,
    todoExtractionPrompt: process.env.TODO_EXTRACTION_PROMPT,
    taskExecutionPrompt: process.env.TASK_EXECUTION_PROMPT,
    perplexityApiKey: process.env.PERPLEXITY_API_KEY,
    enablePerplexitySearch: process.env.ENABLE_PERPLEXITY_SEARCH,
    enableSlackOcr: process.env.ENABLE_SLACK_OCR,
    slackBotToken: process.env.SLACK_BOT_TOKEN,
    slackSigningSecret: process.env.SLACK_SIGNING_SECRET,
    ocrTriggerEmoji: process.env.OCR_TRIGGER_EMOJI,
    googleCloudCredentialsPath: process.env.GOOGLE_CLOUD_CREDENTIALS_PATH,
    ocrGithubPath: process.env.OCR_GITHUB_PATH,
    expressPort: process.env.EXPRESS_PORT,
  });

  cachedConfig = parsed;
  return parsed;
}
