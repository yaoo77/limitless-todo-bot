import process from 'node:process';

import cron from 'node-cron';

import { fetchLifelogs } from './clients/limitless.js';
import { loadConfig } from './config.js';
import {
  getLatestEndTime,
  hasProcessedTask,
  recordProcessedTask,
  upsertLatestEndTime,
} from './db/repository.js';
import { sendTasksToSlack } from './services/slackNotifier.js';
import { extractTasksFromLifelogs } from './services/taskExtractor.js';
import { computeTaskHash } from './utils/hash.js';

const config = loadConfig();

async function processOnce(): Promise<void> {
  const lastProcessed = await getLatestEndTime();

  const lifelogs = await fetchLifelogs({
    apiKey: config.limitlessApiKey,
    limit: 5,
    includeContents: true,
    includeMarkdown: false,
    includeHeadings: false,
    timezone: config.timezone,
    startTime: lastProcessed?.toISOString(),
  });

  const newLifelogs = lifelogs.filter((log) => {
    if (!lastProcessed) return true;
    return new Date(log.endTime) > lastProcessed;
  });

  if (newLifelogs.length === 0) {
    console.log('[processor] No new lifelogs to process');
    return;
  }

  console.log(`[processor] Processing ${newLifelogs.length} lifelog(s)`);

  const tasks = await extractTasksFromLifelogs(newLifelogs, config);
  if (tasks.length === 0) {
    console.log('[processor] No tasks extracted');
    const maxEndTime = getMaxEndTime(newLifelogs);
    if (maxEndTime) {
      await upsertLatestEndTime(maxEndTime);
    }
    return;
  }

  const uniqueTasks = [];
  for (const task of tasks) {
    const hash = computeTaskHash(task.lifelogId, task.task, task.timestamp);
    const alreadyProcessed = await hasProcessedTask(task.lifelogId, hash);
    if (alreadyProcessed) {
      continue;
    }

    uniqueTasks.push({ ...task, hash });
  }

  if (uniqueTasks.length === 0) {
    console.log('[processor] No new unique tasks to notify');
    const maxEndTime = getMaxEndTime(newLifelogs);
    if (maxEndTime) {
      await upsertLatestEndTime(maxEndTime);
    }
    return;
  }

  const latestEndTime = getMaxEndTime(newLifelogs);
  const tasksForSlack = uniqueTasks.map(({ lifelogId, task, timestamp }) => ({
    lifelogId,
    task,
    timestamp,
  }));

  await sendTasksToSlack(tasksForSlack, config, {
    latestEndTime: latestEndTime?.toISOString() ?? null,
    totalTasks: uniqueTasks.length,
  });

  for (const task of uniqueTasks) {
    await recordProcessedTask(task.lifelogId, task.hash, task.task, task.timestamp);
  }

  if (latestEndTime) {
    await upsertLatestEndTime(latestEndTime);
  }

  console.log(`[processor] Completed. Notified ${uniqueTasks.length} task(s).`);
}

function getMaxEndTime(lifelogs: Array<{ endTime: string }>): Date | null {
  if (lifelogs.length === 0) return null;

  return lifelogs
    .map((log) => new Date(log.endTime))
    .reduce((max, current) => (current > max ? current : max), new Date(lifelogs[0].endTime));
}

function getCronExpression(minutes: number): string {
  if (minutes <= 0) {
    throw new Error('Poll interval must be greater than 0');
  }

  return minutes === 1 ? '* * * * *' : `*/${minutes} * * * *`;
}

async function main() {
  try {
    if (process.env.RUN_ONCE === 'true') {
      await processOnce();
      await shutdown();
      return;
    }

    const cronExpression = getCronExpression(config.pollIntervalMinutes);
    console.log(`[bootstrap] Scheduling job with cron expression "${cronExpression}"`);

    const task = cron.schedule(
      cronExpression,
      () => {
        processOnce().catch((error) => {
          console.error('[processor] Unhandled error', error);
        });
      },
    );

    // Run immediately on startup
    processOnce().catch((error) => {
      console.error('[processor] Initial run error', error);
    });

    const signals: Array<NodeJS.Signals> = ['SIGTERM', 'SIGINT'];
    for (const signal of signals) {
      process.on(signal, async () => {
        console.log(`[bootstrap] Received ${signal}, shutting down...`);
        task.stop();
        await shutdown();
        process.exit(0);
      });
    }
  } catch (error) {
    console.error('[bootstrap] Fatal error', error);
    await shutdown();
    process.exit(1);
  }
}

async function shutdown() {
  const { pool } = await import('./db/client.js');
  await pool.end();
}

main().catch(async (error) => {
  console.error('[runtime] Fatal error', error);
  await shutdown();
  process.exit(1);
});
