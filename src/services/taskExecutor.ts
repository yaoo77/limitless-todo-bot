import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import type { AppConfig } from '../config.js';
import type { TodoTask } from './taskExtractor.js';

export interface TaskExecutionResult {
  task: TodoTask;
  report: string;
  success: boolean;
  error?: string;
}

const executionResponseSchema = z.object({
  task_report: z.string(),
});

export class TaskExecutor {
  private readonly anthropic: Anthropic;

  constructor(private readonly config: AppConfig) {
    const apiKey = this.config.anthropicApiKey;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for task execution');
    }

    this.anthropic = new Anthropic({
      apiKey,
    });
  }

  async executeTask(task: TodoTask): Promise<TaskExecutionResult> {
    try {
      console.log(`[executor] Executing task: ${task.task}`);

      // タスク実行エージェントのプロンプト
      const systemPrompt = `あなたはユーザーが入力するTodoタスクを実行する便利なAIエージェントです。
ユーザーの入力に対して、利用可能なツール（Gmail、Google Calendar、Notion、Zoom等）を適切に活用しながら、タスクを実行してください。

出力するものは、タスクに対する実行結果レポートをお願いします。
レポートは日本語で、わかりやすく簡潔にお願いします。
slackメッセージとして送るので、絵文字や改行を適切に入れてみやすくお願いします。

レポートの例:
\${title}
- 時刻

\${heading}
\${paragraph}
...
---
リンクなども適切に挟んでください

必ずJSON形式で出力してください:
{
  "task_report": "..."
}`;

      const userPrompt = `ユーザー入力値: ${task.task}\n時間: ${task.timestamp}`;

      const result = await this.callClaudeWithMCP(systemPrompt, userPrompt);

      console.log(`[executor] Task executed successfully`);

      return {
        task,
        report: result.task_report,
        success: true,
      };
    } catch (error) {
      console.error(`[executor] Task execution failed:`, error);

      return {
        task,
        report: `タスク実行中にエラーが発生しました: ${(error as Error).message}`,
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private async callClaudeWithMCP(systemPrompt: string, userPrompt: string): Promise<{ task_report: string }> {
    if (!this.config.zapierMcpApiKey) {
      throw new Error('ZAPIER_MCP_API_KEY is required for task execution');
    }

    // Anthropic公式のMCP統合を使用
    const response = await this.anthropic.beta.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      mcp_servers: [
        {
          type: 'url',
          url: this.config.zapierMcpUrl || 'https://mcp.zapier.com/api/mcp/mcp',
          name: 'zapier',
          authorization_token: this.config.zapierMcpApiKey,
        },
      ],
      betas: ['mcp-client-2025-04-04'],
      temperature: 0.3,
    });

    console.log(`[executor] Claude response (stop_reason: ${response.stop_reason})`);

    // 最終応答を取得
    const textBlocks = response.content.filter((block): block is Anthropic.TextBlock => block.type === 'text');

    if (textBlocks.length > 0) {
      const content = textBlocks[0].text;

      try {
        const parsed = JSON.parse(content);
        const validated = executionResponseSchema.parse(parsed);

        return validated;
      } catch (parseError) {
        // JSON形式でない場合、そのままレポートとして使用
        return {
          task_report: content,
        };
      }
    }

    throw new Error('Task execution did not produce a valid result');
  }
}
