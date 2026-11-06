import 'dotenv/config';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { db, pool } from './client.js';

try {
  await migrate(db, { migrationsFolder: resolve('db/migrations') });
  console.log('Database migrations are up to date.');
} catch (error) {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
