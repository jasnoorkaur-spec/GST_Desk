import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { resolve } from 'node:path';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import storageRoutes, { uploadRoot } from './routes/storage.js';
import { appErrorHandler } from './middleware.js';
import { pool } from './db/client.js';

const app = express();
const root = resolve(process.cwd());
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many attempts. Please wait a little and try again.' } });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/verify-otp', authLimiter);
app.use('/api/auth/resend-otp', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api', dataRoutes);
app.use('/api', storageRoutes);
app.get('/healthz', async (req, res) => {
  try { await pool.query('SELECT 1'); res.status(200).json({ ok: true, database: 'ready' }); }
  catch { res.status(503).json({ ok: false, database: 'unavailable' }); }
});
app.use('/uploads', express.static(uploadRoot, { fallthrough: false, maxAge: '1h' }));
app.use('/shared', express.static(resolve(root, 'src/shared'), { fallthrough: false, maxAge: '1h' }));
app.get('/vendor/jspdf.umd.min.js', (req, res) => res.sendFile(resolve(root, 'node_modules/jspdf/dist/jspdf.umd.min.js')));
app.get('/vendor/jspdf.plugin.autotable.js', (req, res) => res.sendFile(resolve(root, 'node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.js')));
app.use(express.static(resolve(root, 'public'), { index: false, maxAge: '1h' }));
const pageRoutes = ['/', '/login', '/register', '/invoices', '/customers', '/products', '/reports', '/settings'];
app.get(pageRoutes, (req, res) => res.sendFile(resolve(root, 'public/index.html')));
app.get('/invoices/:id', (req, res) => res.sendFile(resolve(root, 'public/index.html')));
app.use('/api', (req, res) => res.status(404).json({ message: 'That application page could not be found.' }));
app.use(appErrorHandler);
export default app;
