import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema.js';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set. Configure it in your environment variables.');
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 5,
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
