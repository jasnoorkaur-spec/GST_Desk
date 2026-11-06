import jwt from 'jsonwebtoken';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import { db } from '../db/client.js';

const secret = process.env.GST_APP_JWT_SECRET;
if (!secret || Buffer.byteLength(secret) < 32) throw new Error('GST_APP_JWT_SECRET must contain at least 32 bytes.');
const SESSION_COOKIE = 'gst_session';
const CSRF_COOKIE = 'gst_csrf';
const PENDING_COOKIE = 'gst_pending';
const localHttp = process.env.LOCAL_HTTP_COOKIE === 'true';
const cookieBase = { path: '/', sameSite: localHttp ? 'lax' : 'none', secure: !localHttp };

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, email: user.email, typ: 'session' }, secret, { expiresIn: '8h', issuer: 'gstdesk' });
  const csrfToken = randomBytes(24).toString('hex');
  res.cookie(SESSION_COOKIE, token, { ...cookieBase, httpOnly: true, maxAge: 8 * 60 * 60 * 1000 });
  res.cookie(CSRF_COOKIE, csrfToken, { ...cookieBase, httpOnly: false, maxAge: 8 * 60 * 60 * 1000 });
  res.clearCookie(PENDING_COOKIE, cookieBase);
  return csrfToken;
}

export function issuePendingOtp(res, userId, tokenId) {
  const token = jwt.sign({ sub: userId, jti: tokenId, typ: 'otp' }, secret, { expiresIn: '5m', issuer: 'gstdesk' });
  res.cookie(PENDING_COOKIE, token, { ...cookieBase, httpOnly: true, maxAge: 5 * 60 * 1000 });
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { ...cookieBase, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...cookieBase, httpOnly: false });
  res.clearCookie(PENDING_COOKIE, { ...cookieBase, httpOnly: true });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
  try {
    const payload = jwt.verify(token, secret, { issuer: 'gstdesk' });
    if (payload.typ !== 'session' || !payload.sub) throw new Error('Invalid session');
    req.authUserId = payload.sub;
    next();
  } catch {
    clearSession(res);
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
}

export function requireCsrf(req, res, next) {
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get('x-csrf-token');
  if (!cookieToken || !headerToken) return res.status(403).json({ message: 'Please refresh the page and try again.' });
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  if (cookieBuffer.length !== headerBuffer.length || !timingSafeEqual(cookieBuffer, headerBuffer)) {
    return res.status(403).json({ message: 'We could not verify this request. Please refresh and try again.' });
  }
  next();
}

export function readPendingOtp(req) {
  const token = req.cookies?.[PENDING_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret, { issuer: 'gstdesk' });
    return payload.typ === 'otp' ? { userId: payload.sub, tokenId: payload.jti } : null;
  } catch { return null; }
}

export async function safeUser(userId) {
  const [user] = await db.select({ id: users.id, name: users.name, email: users.email, mobile: users.mobile, mfaEnabled: users.mfaEnabled }).from(users).where(eq(users.id, userId)).limit(1);
  return user || null;
}

export function createCsrfToken() { return randomBytes(24).toString('hex'); }
