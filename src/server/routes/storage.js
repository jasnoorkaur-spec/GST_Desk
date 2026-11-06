import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { businessProfiles } from '../db/schema.js';
import { asyncRoute } from '../middleware.js';
import { requireAuth, requireCsrf } from '../security/auth.js';

export const uploadRoot = resolve(process.env.UPLOAD_DIR || 'uploads');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
const allowed = new Map([
  ['image/png', { ext: 'png', signature: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) }],
  ['image/jpeg', { ext: 'jpg', signature: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff }],
  ['image/webp', { ext: 'webp', signature: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' }],
]);
router.use(requireAuth, requireCsrf);

async function removeStoredLogo(userId, logoUrl) {
  const match = /^\/uploads\/logos\/([\w-]+)\/([\w-]+\.(?:png|jpg|webp))$/.exec(logoUrl || '');
  if (!match || match[1] !== userId) return;
  await unlink(join(uploadRoot, 'logos', userId, basename(match[2]))).catch(() => {});
}

router.post('/settings/logo', upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Choose a PNG, JPG or WebP logo image.' });
  const kind = allowed.get(req.file.mimetype);
  if (!kind || !kind.signature(req.file.buffer)) return res.status(400).json({ message: 'That file is not a supported PNG, JPG or WebP image.' });
  const userId = req.authUserId;
  const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, userId)).limit(1);
  if (!profile) return res.status(404).json({ message: 'Business profile not found.' });

  const fileName = `${randomUUID()}.${kind.ext}`;
  const dir = join(uploadRoot, 'logos', userId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), req.file.buffer);

  const logoUrl = `/uploads/logos/${userId}/${fileName}`;
  await db.update(businessProfiles).set({ logoUrl, updatedAt: new Date() }).where(eq(businessProfiles.userId, userId));
  await removeStoredLogo(userId, profile.logoUrl);
  res.json({ logoUrl, message: 'Business logo saved.' });
}));

router.delete('/settings/logo', asyncRoute(async (req, res) => {
  const userId = req.authUserId;
  const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, userId)).limit(1);
  await db.update(businessProfiles).set({ logoUrl: null, updatedAt: new Date() }).where(eq(businessProfiles.userId, userId));
  await removeStoredLogo(userId, profile?.logoUrl);
  res.json({ message: 'The logo was removed from your business profile.' });
}));

export default router;
