import { fetch, Response } from 'undici';
import { z } from 'zod';

import type { Lifelog } from '../clients/limitless.js';
import type { AppConfig } from '../config.js';

export interface TodoTask {
  lifelogId: string;
  task: string;
  timestamp: string;
}

const responseSchema = z.object({
  tasks: z
    .array(
      z.object({
        lifelogId: z.string().min(1),
        task: z.string().min(1),
        timestamp: z.string().min(1),
      }),
    )
    .default([]),
});

function requireModelKey(config: AppConfig): string {
  if (config.taskModelProvider === 'openrouter') {
    if (!config.openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY is required for openrouter provider.');
    }

    return config.openRouterApiKey;
  }

  if (!config.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is required for openai provider.');
  }

  return config.openAiApiKey;
}

function buildPrompt(lifelogs: Lifelog[]) {
  return JSON.stringify(
    {
      lifelogs: lifelogs.map((log) => ({
        id: log.id,
        title: log.title,
        startTime: log.startTime,
        endTime: log.endTime,
        contents: log.contents.map((content) => ({
          content: content.content,
          endTime: content.endTime,
        })),
      })),
    },
    null,
    2,
  );
}

export async function extractTasksFromLifelogs(
  lifelogs: Lifelog[],
  config: AppConfig,
): Promise<TodoTask[]> {
  if (lifelogs.length === 0) {
    return [];
  }

  const apiKey = requireModelKey(config);

  // カスタムプロンプトまたはデフォルトプロンプトを使用
  const systemPrompt =
    config.todoExtractionPrompt ||
    `あなたは、ユーザーが入力する会話の文字起こしから、To-Doリストに追加すべき項目を抽出・確認するAIエージェントです。
ユーザーが「〜するべき」「リマインドしておきたい」「覚えておきたい」「後で検索したい」といった意図を示す発言があれば、それらをタスクとして認識し、該当するタスクをすべて指定のフォーマットで出力してください。
雑談など、タスク化に不要な発言は無視して構いません。
文字起こしであることを前提に、文脈を踏まえてメタ認知的に判断しながら処理してください。

## 注意
- 必ず〇〇の〇〇を行う のようにtaskは具体的に書くようにしてください
- 具体化する際に、文字起こしや会話の前後を元に作成すること
- 具体化できないものはTodoに追加しないこと

例:
OK: AIエージェントフレームワークmastraの情報を共有する
NG: 情報を共有する

出力形式:
{
  "tasks": [
    {
      "lifelogId": "...",
      "task": "...",
      "timestamp": "2025-01-01T00:01:00+09:00"
    }
  ]
}`;

  const payload = {
    model: config.taskModelId,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              '以下のlifelogデータから、タスク化が必要な発言を抽出してください。',
              '各タスクは日本語で簡潔にまとめ、推定時刻（ISO8601、タイムゾーン込み）を付与してください。',
              'lifelogId は入力データの id を使用してください。',
              '---',
              buildPrompt(lifelogs),
            ].join('\n'),
          },
        ],
      },
    ],
    temperature: 0.2,
  } as Record<string, unknown>;

  let endpoint = '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  if (config.taskModelProvider === 'openrouter') {
    endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    headers['X-Title'] = 'Limitless Todo Extractor';
  } else {
    endpoint = 'https://api.openai.com/v1/chat/completions';
    payload.response_format = { type: 'json_object' };
  }

  const response = (await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })) as Response;

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Task extraction failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };

  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    return [];
  }

  let parsedJson: unknown;
  try {
    const sanitized = sanitizeJsonOutput(rawContent);
    parsedJson = JSON.parse(sanitized);
  } catch (error) {
    throw new Error(`Failed to parse task extractor output: ${(error as Error).message}`);
  }

  const parsedTasks = responseSchema.parse(parsedJson);
  return parsedTasks.tasks;
}

function sanitizeJsonOutput(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('```')) {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}
