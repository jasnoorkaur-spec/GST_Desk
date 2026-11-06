import { createHash, randomInt, randomBytes, timingSafeEqual } from 'node:crypto';

export const newOtp = () => String(randomInt(0, 1000000)).padStart(6, '0');
export const newResetCode = () => randomBytes(24).toString('hex');
export const hashToken = (value) => createHash('sha256').update(String(value)).digest('hex');
export function safeHashEqual(value, expectedHash) {
  const actual = Buffer.from(hashToken(value));
  const expected = Buffer.from(String(expectedHash || ''));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
