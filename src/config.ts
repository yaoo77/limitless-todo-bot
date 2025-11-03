import { z } from 'zod';

const configSchema = z.object({
  limitlessApiKey: z.string().min(1),
  slackWebhookUrl: z.string().url(),
  pollIntervalMinutes: z.coerce.number().default(5),
  timezone: z.string().default('UTC'),
  taskModelProvider: z.enum(['openrouter', 'openai']).default('openrouter'),
  taskModelId: z.string().default('x-ai/grok-4-fast'),
  openRouterApiKey: z.string().optional(),
  openAiApiKey: z.string().optional(),
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
  });

  cachedConfig = parsed;
  return parsed;
}
