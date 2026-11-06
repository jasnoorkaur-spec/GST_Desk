import nodemailer from 'nodemailer';

const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
let transport;
function getTransport() {
  if (!smtpConfigured) return null;
  if (!transport) transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}
export const emailConfigured = () => smtpConfigured;

export async function sendCodeEmail(to, code, purpose) {
  const mailer = getTransport();
  if (!mailer) return false;
  const login = purpose === 'login_otp';
  await mailer.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: login ? 'Your GST Desk verification code' : 'Your GST Desk password reset code',
    text: `${login ? 'Your sign-in verification code expires in five minutes' : 'Your password reset code expires in 30 minutes'}: ${code}. If you did not request this, you can ignore this email.`,
  });
  return true;
}
