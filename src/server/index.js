import 'dotenv/config';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { db, pool } from './db/client.js';
import app from './app.js';

const port = Number(process.env.PORT || 3000);
try {
  await migrate(db, { migrationsFolder: resolve('db/migrations') });
  const server = app.listen(port, '0.0.0.0', () => console.log(`GST Desk listening on port ${port}`));
  const shutdown = async () => {
    server.close(async () => { await pool.end(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (error) {
  console.error('GST Desk startup failed:', error?.message || 'Database startup error');
  await pool.end().catch(() => {});
  process.exit(1);
}
