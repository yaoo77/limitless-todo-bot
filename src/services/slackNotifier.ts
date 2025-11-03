import { fetch, Response } from 'undici';

import type { AppConfig } from '../config.js';
import type { TodoTask } from './taskExtractor.js';

export interface NotificationContext {
  latestEndTime: string | null;
  totalTasks: number;
}

export async function sendTasksToSlack(
  tasks: TodoTask[],
  config: AppConfig,
  context: NotificationContext,
): Promise<void> {
  if (tasks.length === 0) {
    return;
  }

  const blocks = buildBlocks(tasks, context);

  const response = (await fetch(config.slackWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  })) as Response;

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Slack notification failed (${response.status}): ${errorText}`);
  }
}

function buildBlocks(tasks: TodoTask[], context: NotificationContext) {
  const header = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `:robot_face: Limitless TODO Bot\n*新しいタスク*: ${tasks.length}件`,
    },
  };

  const meta = {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `最終処理時刻: ${context.latestEndTime ?? '未取得'}`,
      },
    ],
  };

  const taskBlocks = tasks.map((task) => ({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `• *${task.timestamp}* _(lifelog: ${task.lifelogId})_\n${task.task}`,
    },
  }));

  const divider = { type: 'divider' };

  return [header, meta, divider, ...taskBlocks];
}
