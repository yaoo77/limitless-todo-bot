import { and, desc, eq } from 'drizzle-orm';

import { db } from './client.js';
import { lifelogState, processedTaskHashes, taskExecutions, type TaskExecutionInsert } from './schema.js';

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

// ========================================
// Task Execution Management
// ========================================

/**
 * タスク実行レコードを作成
 */
export async function createTaskExecution(data: TaskExecutionInsert): Promise<number> {
  const result = await db.insert(taskExecutions).values(data).returning({ id: taskExecutions.id });

  return result[0].id;
}

/**
 * タスク実行ステータスを更新
 */
export async function updateTaskExecutionStatus(
  id: number,
  status: 'pending' | 'running' | 'completed' | 'failed',
  data?: {
    executionReport?: string;
    errorMessage?: string;
    startedAt?: Date;
    completedAt?: Date;
    retryCount?: number;
  },
): Promise<void> {
  await db
    .update(taskExecutions)
    .set({
      status,
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(taskExecutions.id, id));
}

/**
 * タスク実行履歴を取得（最新10件）
 */
export async function getRecentTaskExecutions(limit = 10) {
  return db.select().from(taskExecutions).orderBy(desc(taskExecutions.createdAt)).limit(limit);
}

/**
 * 失敗したタスクを取得
 */
export async function getFailedTaskExecutions(limit = 10) {
  return db
    .select()
    .from(taskExecutions)
    .where(eq(taskExecutions.status, 'failed'))
    .orderBy(desc(taskExecutions.createdAt))
    .limit(limit);
}

/**
 * 実行中のタスク数を取得
 */
export async function countRunningTasks(): Promise<number> {
  const result = await db
    .select()
    .from(taskExecutions)
    .where(eq(taskExecutions.status, 'running'));

  return result.length;
}
