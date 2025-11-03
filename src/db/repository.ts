import { and, eq } from 'drizzle-orm';

import { db } from './client.js';
import { lifelogState, processedTaskHashes } from './schema.js';

const CURSOR_ID = 'latest';

export async function getLatestEndTime(): Promise<Date | null> {
  const result = await db
    .select({ latestEndTime: lifelogState.latestEndTime })
    .from(lifelogState)
    .where(eq(lifelogState.id, CURSOR_ID))
    .limit(1);

  return result[0]?.latestEndTime ?? null;
}

export async function upsertLatestEndTime(latestEndTime: Date): Promise<void> {
  await db
    .insert(lifelogState)
    .values({ id: CURSOR_ID, latestEndTime })
    .onConflictDoUpdate({
      target: lifelogState.id,
      set: { latestEndTime, updatedAt: new Date() },
    });
}

export async function hasProcessedTask(lifelogId: string, taskHash: string): Promise<boolean> {
  const result = await db
    .select({ taskHash: processedTaskHashes.taskHash })
    .from(processedTaskHashes)
    .where(and(eq(processedTaskHashes.lifelogId, lifelogId), eq(processedTaskHashes.taskHash, taskHash)))
    .limit(1);

  return result.length > 0;
}

export async function recordProcessedTask(
  lifelogId: string,
  taskHash: string,
  task: string,
  timestamp: string,
): Promise<void> {
  await db
    .insert(processedTaskHashes)
    .values({ lifelogId, taskHash, task, timestamp })
    .onConflictDoNothing({
      target: [processedTaskHashes.lifelogId, processedTaskHashes.taskHash],
    });
}
