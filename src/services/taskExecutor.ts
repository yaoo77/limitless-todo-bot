import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import type { AppConfig } from '../config.js';
import type { MCPClient } from '../clients/mcpClient.js';
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
  constructor(
    private readonly config: AppConfig,
    private readonly mcpClient: MCPClient,
  ) {}

  async executeTask(task: TodoTask): Promise<TaskExecutionResult> {
    try {
      console.log(`[executor] Executing task: ${task.task}`);

      // MCPツールの情報を取得
      const availableTools = this.mcpClient.getAvailableTools();
      const toolDescriptions = availableTools
        .map((tool) => `- ${tool.name}: ${tool.description || 'No description'}`)
        .join('\n');

      // タスク実行エージェントのプロンプト
      const systemPrompt = `あなたはユーザーが入力するTodoタスクを実行する便利なAIエージェントです。
ユーザーの入力に対して、あなたが持っている以下のツールを適切に活用しながら、ユーザーがやりたいタスクの結果を作成して出力してください。

利用可能なツール:
${toolDescriptions}

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

      // Claudeにタスク実行を依頼（Tool Use使用）
      const result = await this.callClaudeWithTools(systemPrompt, userPrompt, availableTools);

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

  private async callClaudeWithTools(
    systemPrompt: string,
    userPrompt: string,
    tools: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>,
  ): Promise<{ task_report: string }> {
    const apiKey = this.config.anthropicApiKey;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for task execution with Anthropic provider');
    }

    const anthropic = new Anthropic({
      apiKey,
    });

    // Anthropic Tool Use フォーマットに変換
    const claudeTools: Anthropic.Tool[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: userPrompt,
      },
    ];

    let iteration = 0;
    const maxIterations = 5; // 無限ループ防止

    while (iteration < maxIterations) {
      iteration++;

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: claudeTools,
        temperature: 0.3,
      });

      console.log(`[executor] Claude response (stop_reason: ${response.stop_reason})`);

      // ツール使用がある場合
      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
        );

        console.log(`[executor] Claude requested ${toolUseBlocks.length} tool call(s)`);

        // アシスタントの応答を追加
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        // ツール実行結果を収集
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUseBlock of toolUseBlocks) {
          const toolName = toolUseBlock.name;
          const toolArgs = toolUseBlock.input as Record<string, unknown>;

          console.log(`[executor] Calling MCP tool: ${toolName}`, toolArgs);

          try {
            const toolResult = await this.mcpClient.callTool(toolName, toolArgs);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: JSON.stringify(toolResult),
            });
          } catch (toolError) {
            console.error(`[executor] Tool call failed:`, toolError);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: JSON.stringify({
                error: (toolError as Error).message,
              }),
              is_error: true,
            });
          }
        }

        // ツール実行結果を追加
        messages.push({
          role: 'user',
          content: toolResults,
        });

        // 次のイテレーションへ
        continue;
      }

      // 最終応答を取得
      if (response.stop_reason === 'end_turn') {
        const textBlocks = response.content.filter(
          (block): block is Anthropic.TextBlock => block.type === 'text',
        );

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
      }

      // その他の停止理由の場合、エラー
      break;
    }

    throw new Error('Task execution did not produce a valid result');
  }
}
