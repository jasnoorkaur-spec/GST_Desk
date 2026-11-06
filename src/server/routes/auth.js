import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/client.js';
import { authTokens, businessProfiles, users } from '../db/schema.js';
import { asyncRoute, validateBody } from '../middleware.js';
import { clearSession, issuePendingOtp, issueSession, readPendingOtp, requireAuth, requireCsrf, safeUser } from '../security/auth.js';
import { hashToken, newOtp, newResetCode, safeHashEqual } from '../security/tokens.js';
import { emailConfigured, sendCodeEmail } from '../services/email.js';

const router = Router();
const registerSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.email().max(254), mobile: z.string().trim().min(7).max(24), password: z.string().min(8).max(128) });
const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) });
const otpSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the six-digit verification code.') });
const forgotSchema = z.object({ email: z.email().max(254) });
const resetSchema = z.object({ email: z.email().max(254), code: z.string().min(24).max(128), password: z.string().min(8).max(128) });

async function profileFor(userId) {
  const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, userId)).limit(1);
  return profile || null;
}
function sessionResponse(res, user, profile) {
  const csrfToken = issueSession(res, user);
  res.json({ user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile, mfaEnabled: Boolean(user.mfaEnabled) }, profile, csrfToken });
}

router.post('/register', validateBody(registerSchema), asyncRoute(async (req, res) => {
  const { name, mobile, password } = req.validatedBody;
  const email = req.validatedBody.email.trim().toLowerCase();
  const user = { id: randomUUID(), name, email, mobile, passwordHash: await bcrypt.hash(password, 12), mfaEnabled: false };
  const profile = { id: randomUUID(), userId: user.id, businessName: '', invoicePrefix: 'INV', nextInvoiceNumber: 1, defaultPaymentTerms: 0 };
  await db.transaction(async (tx) => {
    await tx.insert(users).values(user);
    await tx.insert(businessProfiles).values(profile);
  });
  sessionResponse(res, user, profile);
}));

router.post('/login', validateBody(loginSchema), asyncRoute(async (req, res) => {
  const email = req.validatedBody.email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await bcrypt.compare(req.validatedBody.password, user.passwordHash))) return res.status(401).json({ message: 'Email or password is incorrect.' });
  if (user.mfaEnabled) {
    if (!emailConfigured()) return res.status(503).json({ message: 'Email verification is enabled but email delivery is not configured. Contact your account administrator.' });
    const code = newOtp();
    const tokenId = randomUUID();
    await db.insert(authTokens).values({ id: tokenId, userId: user.id, purpose: 'login_otp', tokenHash: hashToken(code), expiresAt: new Date(Date.now() + 5 * 60_000), attempts: 0, resendAt: new Date(Date.now() + 30_000) });
    try { await sendCodeEmail(user.email, code, 'login_otp'); }
    catch { await db.delete(authTokens).where(eq(authTokens.id, tokenId)); return res.status(503).json({ message: 'We could not send the verification code. Please try again later.' }); }
    issuePendingOtp(res, user.id, tokenId);
    return res.json({ requiresOtp: true });
  }
  sessionResponse(res, user, await profileFor(user.id));
}));

router.post('/verify-otp', validateBody(otpSchema), asyncRoute(async (req, res) => {
  const pending = readPendingOtp(req);
  if (!pending) return res.status(401).json({ message: 'Your verification session expired. Please sign in again.' });
  const [record] = await db.select().from(authTokens).where(and(eq(authTokens.id, pending.tokenId), eq(authTokens.userId, pending.userId), eq(authTokens.purpose, 'login_otp'), isNull(authTokens.consumedAt), gt(authTokens.expiresAt, new Date()))).limit(1);
  if (!record) return res.status(401).json({ message: 'That code has expired. Please sign in again.' });
  if (!safeHashEqual(req.validatedBody.code, record.tokenHash)) {
    const nextAttempts = record.attempts + 1;
    if (nextAttempts >= 5) await db.delete(authTokens).where(eq(authTokens.id, record.id));
    else await db.update(authTokens).set({ attempts: nextAttempts }).where(eq(authTokens.id, record.id));
    return res.status(400).json({ message: nextAttempts >= 5 ? 'Too many attempts. Please sign in again.' : 'That code is not correct. Please try again.' });
  }
  await db.delete(authTokens).where(eq(authTokens.id, record.id));
  const user = await safeUser(pending.userId);
  if (!user) return res.status(401).json({ message: 'This account is no longer available.' });
  sessionResponse(res, user, await profileFor(user.id));
}));

router.post('/resend-otp', asyncRoute(async (req, res) => {
  const pending = readPendingOtp(req);
  if (!pending || !emailConfigured()) return res.status(400).json({ message: 'Please sign in again to request a new code.' });
  const [record] = await db.select().from(authTokens).where(and(eq(authTokens.id, pending.tokenId), eq(authTokens.userId, pending.userId), eq(authTokens.purpose, 'login_otp'), isNull(authTokens.consumedAt), gt(authTokens.expiresAt, new Date()))).limit(1);
  if (!record) return res.status(400).json({ message: 'That verification has expired. Please sign in again.' });
  if (record.resendAt && record.resendAt > new Date()) return res.status(429).json({ message: 'Please wait a few seconds before requesting another code.' });
  const code = newOtp();
  await db.update(authTokens).set({ tokenHash: hashToken(code), attempts: 0, expiresAt: new Date(Date.now() + 5 * 60_000), resendAt: new Date(Date.now() + 30_000) }).where(eq(authTokens.id, record.id));
  try { await sendCodeEmail((await safeUser(pending.userId)).email, code, 'login_otp'); }
  catch { return res.status(503).json({ message: 'We could not send the new code. Please try again later.' }); }
  res.json({ message: 'A new verification code has been sent.' });
}));

router.post('/forgot-password', validateBody(forgotSchema), asyncRoute(async (req, res) => {
  const email = req.validatedBody.email.trim().toLowerCase();
  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email)).limit(1);
  const generic = { message: 'If the account exists and email delivery is configured, a reset code will be sent.', emailConfigured: emailConfigured() };
  if (!user || !emailConfigured()) return res.json(generic);
  const code = newResetCode();
  await db.insert(authTokens).values({ id: randomUUID(), userId: user.id, purpose: 'password_reset', tokenHash: hashToken(code), expiresAt: new Date(Date.now() + 30 * 60_000), attempts: 0 });
  try { await sendCodeEmail(user.email, code, 'password_reset'); }
  catch { return res.json(generic); }
  res.json(generic);
}));

router.post('/reset-password', validateBody(resetSchema), asyncRoute(async (req, res) => {
  const email = req.validatedBody.email.trim().toLowerCase();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) return res.status(400).json({ message: 'That reset code is invalid or expired.' });
  const [record] = await db.select().from(authTokens).where(and(eq(authTokens.userId, user.id), eq(authTokens.purpose, 'password_reset'), isNull(authTokens.consumedAt), gt(authTokens.expiresAt, new Date()))).orderBy(desc(authTokens.createdAt)).limit(1);
  if (!record || record.attempts >= 5 || !safeHashEqual(req.validatedBody.code, record.tokenHash)) {
    if (record) {
      const nextAttempts = record.attempts + 1;
      if (nextAttempts >= 5) await db.delete(authTokens).where(eq(authTokens.id, record.id));
      else await db.update(authTokens).set({ attempts: nextAttempts }).where(eq(authTokens.id, record.id));
    }
    return res.status(400).json({ message: 'That reset code is invalid or expired.' });
  }
  const passwordHash = await bcrypt.hash(req.validatedBody.password, 12);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
    await tx.delete(authTokens).where(and(eq(authTokens.userId, user.id), eq(authTokens.purpose, 'password_reset')));
  });
  clearSession(res);
  res.json({ message: 'Password updated. Please sign in with your new password.' });
}));

router.get('/me', requireAuth, asyncRoute(async (req, res) => {
  const user = await safeUser(req.authUserId);
  if (!user) return res.status(401).json({ message: 'Your account is no longer available.' });
  res.json({ user, profile: await profileFor(user.id), csrfToken: req.cookies?.gst_csrf || '' });
}));

router.post('/logout', requireAuth, requireCsrf, (req, res) => { clearSession(res); res.json({ message: 'Signed out.' }); });

export default router;
