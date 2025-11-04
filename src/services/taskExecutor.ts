import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import type { AppConfig } from '../config.js';
import { PerplexityClient } from './perplexityClient.js';
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
  private readonly perplexityClient: PerplexityClient | null = null;

  constructor(private readonly config: AppConfig) {
    const apiKey = this.config.anthropicApiKey;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for task execution');
    }

    this.anthropic = new Anthropic({
      apiKey,
    });

    // Perplexity検索が有効な場合、クライアントを初期化
    if (this.config.enablePerplexitySearch && this.config.perplexityApiKey) {
      this.perplexityClient = new PerplexityClient(this.config.perplexityApiKey);
    }
  }

  async executeTask(task: TodoTask): Promise<TaskExecutionResult> {
    try {
      console.log(`[executor] Executing task: ${task.task}`);

      // Perplexity検索が必要な場合、事前に検索
      let searchContext = '';
      if (this.perplexityClient && PerplexityClient.needsSearch(task.task)) {
        console.log(`[executor] Performing Perplexity search for task`);
        try {
          const searchResult = await this.perplexityClient.search(task.task);
          searchContext = `\n\n## 検索結果\n${searchResult.content}\n\n**出典:**\n${searchResult.citations.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
          console.log(`[executor] Perplexity search completed`);
        } catch (error) {
          console.error(`[executor] Perplexity search failed:`, error);
          // 検索失敗してもタスク実行は続行
        }
      }

      // カスタムプロンプトまたはデフォルトプロンプトを使用
      const systemPrompt =
        this.config.taskExecutionPrompt ||
        `あなたはユーザーが入力するTodoタスクを実行する便利なAIエージェントです。
ユーザーの入力に対して、あなたが持っているツールを適切に活用しながら、ユーザーがやりたいタスクの結果を作成して出力してください。

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

      const userPrompt = `ユーザー入力値: ${task.task}\n時間: ${task.timestamp}${searchContext}`;

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

    // リトライ設定
    const maxRetries = 3;
    const retryDelays = [2000, 5000, 10000]; // 2秒、5秒、10秒

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`[executor] Attempt ${attempt + 1}/${maxRetries}`);

        // Anthropic公式のMCP統合を使用
        const response = await this.anthropic.beta.messages.create({
          model: 'claude-haiku-4-5',
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
      } catch (error) {
        const isLastAttempt = attempt === maxRetries - 1;
        const isMcpError =
          error instanceof Error &&
          (error.message.includes('503 Service Unavailable') ||
            error.message.includes('Connection error while communicating with MCP server'));

        if (isMcpError && !isLastAttempt) {
          const delay = retryDelays[attempt];
          console.log(`[executor] MCP server error, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // リトライ不可能なエラー、または最終試行でのエラー
        throw error;
      }
    }

    throw new Error('Task execution failed after all retries');
  }
}
