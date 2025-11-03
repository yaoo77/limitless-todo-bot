import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

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

export type LifelogState = typeof lifelogState.$inferSelect;
