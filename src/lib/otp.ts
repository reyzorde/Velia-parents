import emailjs from '@emailjs/browser';

const OTP_KEY = 'velia_parents_otp';
const TTL_MS = 10 * 60 * 1000;

export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const serviceId = (import.meta.env.VITE_EMAILJS_SERVICE_ID || '').trim();
  const templateId = (import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '').trim();
  const publicKey = (import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '').trim();
  if (!serviceId || !templateId || !publicKey) {
    throw new Error('EmailJS kalitlari yoq (.env: SERVICE_ID, TEMPLATE_ID, PUBLIC_KEY)');
  }
  emailjs.init({ publicKey });
  await emailjs.send(serviceId, templateId, {
    to_email: email,
    email,
    user_email: email,
    otp_code: otp,
    passcode: otp,
    code: otp,
    message: `Velia Parents tasdiqlash kodingiz: ${otp}`,
  });
  localStorage.setItem(
    OTP_KEY,
    JSON.stringify({ email: email.toLowerCase(), otp, expiresAt: Date.now() + TTL_MS })
  );
}

export function verifyStoredOtp(email: string, code: string): boolean {
  const raw = localStorage.getItem(OTP_KEY);
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw) as { email?: string; otp?: string; expiresAt?: number };
    if (!saved.email || !saved.otp || !saved.expiresAt) return false;
    if (saved.expiresAt < Date.now()) return false;
    if (saved.email !== email.toLowerCase()) return false;
    return saved.otp === code.trim();
  } catch {
    return false;
  }
}

export function clearStoredOtp() {
  localStorage.removeItem(OTP_KEY);
}
