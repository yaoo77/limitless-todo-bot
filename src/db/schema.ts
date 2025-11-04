import { integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const lifelogState = pgTable('lifelog_state', {
  id: text('id').primaryKey().default('latest'),
  latestEndTime: timestamp('latest_end_time', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

export const processedTaskHashes = pgTable(
  'processed_task_hashes',
  {
    lifelogId: text('lifelog_id').notNull(),
    taskHash: text('task_hash').notNull(),
    task: text('task').notNull(),
    timestamp: text('timestamp').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.lifelogId, table.taskHash] }),
  }),
);

export const taskExecutions = pgTable('task_executions', {
  id: serial('id').primaryKey(),
  lifelogId: text('lifelog_id').notNull(),
  taskHash: text('task_hash').notNull(),
  task: text('task').notNull(),
  timestamp: text('timestamp').notNull(),
  status: text('status').notNull().default('pending'), // pending, running, completed, failed
  executionReport: text('execution_report'),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

export type LifelogState = typeof lifelogState.$inferSelect;
export type TaskExecution = typeof taskExecutions.$inferSelect;
export type TaskExecutionInsert = typeof taskExecutions.$inferInsert;
