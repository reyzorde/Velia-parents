import { FormEvent, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clearStoredOtp, generateOtp, sendOtpEmail, verifyStoredOtp } from '../lib/otp';
import { isConfigured, supabase } from '../lib/supabase';

type AuthStep = 'email' | 'otp' | 'password' | 'login';

export default function Login() {
  const nav = useNavigate();
  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setError('');
    setInfo('');
    if (!isConfigured) {
      setError('.env da Supabase va EmailJS kalitlarini yozing.');
      return;
    }
    const mail = email.trim().toLowerCase();
    if (!mail.includes('@')) {
      setError('Email notogri');
      return;
    }
    setBusy(true);
    try {
      const otp = generateOtp();
      await sendOtpEmail(mail, otp);
      setStep('otp');
      setInfo('Kod emailga yuborildi.');
      setOtpCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kod yuborilmadi');
    } finally {
      setBusy(false);
    }
  };

  const checkOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (otpCode.trim().length !== 6) {
      setError('6 xonali kodni kiriting');
      return;
    }
    if (!verifyStoredOtp(email.trim().toLowerCase(), otpCode)) {
      setError('Kod notogri yoki muddati otgan');
      return;
    }
    clearStoredOtp();
    setStep('password');
    setInfo('Email tasdiqlandi. Parol ornating.');
  };

  const setPasswordAndEnter = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Parol kamida 6 belgi');
      return;
    }
    if (password !== confirm) {
      setError('Parollar mos emas');
      return;
    }
    setBusy(true);
    const mail = email.trim().toLowerCase();
    try {
      const { data: signed, error: signErr } = await supabase.auth.signUp({
        email: mail,
        password,
        options: { data: { role: 'parent' } },
      });
      if (signErr) {
        if (/already|registered|exists/i.test(signErr.message)) {
          const { error: loginErr } = await supabase.auth.signInWithPassword({ email: mail, password });
          if (loginErr) {
            throw new Error('Bu email bor, lekin parol boshqa. Togri parol bilan «Parol bilan kirish» ni bosing.');
          }
        } else {
          throw new Error(signErr.message);
        }
      } else if (!signed.session && signed.user) {
        const { error: loginErr } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (loginErr) {
          throw new Error('Hisob yaratildi. Supabase Confirm email ni ochiring (OTP EmailJS orqali).');
        }
      }
      nav('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    } finally {
      setBusy(false);
    }
  };

  const loginWithPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isConfigured) {
      setError('.env sozlanmagan');
      return;
    }
    setBusy(true);
    try {
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (loginErr) {
        throw new Error(
          loginErr.message.includes('Invalid')
            ? 'Email yoki parol notogri. Avval kod bilan emailni tasdiqlab parol ornating.'
            : loginErr.message
        );
      }
      nav('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kirish xatosi');
    } finally {
      setBusy(false);
    }
  };

  const updateOtpDigit = (value: string, index: number) => {
    const digits = value.replace(/\D/g, '');
    const arr = otpCode.padEnd(6, ' ').split('').slice(0, 6);
    if (!digits) {
      arr[index] = ' ';
      setOtpCode(arr.join('').replace(/ /g, ''));
      return;
    }
    for (let i = 0; i < digits.length && index + i < 6; i++) arr[index + i] = digits[i];
    const next = arr.join('').replace(/ /g, '').slice(0, 6);
    setOtpCode(next);
    otpRefs.current[Math.min(index + digits.length, 5)]?.focus();
  };

  return (
    <div className="auth">
      <div className="glass auth-card">
        <div className="brand">
          <div className="brand-mark">V</div>
          <div className="brand-name">Velia Parents</div>
        </div>
        <h1>
          {step === 'email' && 'Email'}
          {step === 'otp' && 'Kodni tasdiqlang'}
          {step === 'password' && 'Parol ornating'}
          {step === 'login' && 'Kirish'}
        </h1>
        <p className="sub">
          {step === 'email' && 'Avval emailga kod yuboriladi. Tasdiqlagach parol ornataiz.'}
          {step === 'otp' && `${email} manziliga yuborilgan 6 xonali kod.`}
          {step === 'password' && 'Shu parol bilan keyin Parentsga kirasiz.'}
          {step === 'login' && 'Parol ornatgan bolsangiz — email va parol bilan kiring.'}
        </p>
        {error && <div className="error">{error}</div>}
        {info && !error && <p className="sub" style={{ color: 'var(--ok, #34d399)' }}>{info}</p>}

        {step === 'email' && (
          <form onSubmit={sendCode}>
            <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? <Loader2 className="spin" size={18} /> : null} {busy ? '...' : 'Kod yuborish'}</button>
            <button className="btn btn-ghost" type="button" style={{ width: '100%', marginTop: 10 }} onClick={() => { setStep('login'); setError(''); setInfo(''); }}>Parol bilan kirish</button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={checkOtp}>
            <div className="field">
              <label>Tasdiqlash kodi</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <input key={i} ref={(el) => { otpRefs.current[i] = el; }} inputMode="numeric" maxLength={6} value={otpCode[i] || ''} onChange={(e) => updateOtpDigit(e.target.value, i)} onKeyDown={(e) => { if (e.key === 'Backspace' && !otpCode[i] && i > 0) otpRefs.current[i - 1]?.focus(); }} style={{ width: 44, height: 48, textAlign: 'center', fontSize: 18, fontWeight: 700, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--glass-2)' }} />
                ))}
              </div>
            </div>
            <button className="btn btn-primary" type="submit">Tasdiqlash</button>
            <button className="btn btn-ghost" type="button" style={{ width: '100%', marginTop: 10 }} onClick={() => void sendCode()} disabled={busy}>Qayta yuborish</button>
            <button className="btn btn-ghost" type="button" style={{ width: '100%', marginTop: 4 }} onClick={() => setStep('email')}>Orqaga</button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={setPasswordAndEnter}>
            <div className="field"><label>Yangi parol</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" /></div>
            <div className="field"><label>Parolni tasdiqlang</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} autoComplete="new-password" /></div>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? <Loader2 className="spin" size={18} /> : null} Parolni saqlash va kirish</button>
          </form>
        )}

        {step === 'login' && (
          <form onSubmit={loginWithPassword}>
            <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
            <div className="field"><label>Parol</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="current-password" /></div>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? <Loader2 className="spin" size={18} /> : null} Kirish</button>
            <button className="btn btn-ghost" type="button" style={{ width: '100%', marginTop: 10 }} onClick={() => { setStep('email'); setError(''); }}>Kod bilan parol ornatish</button>
          </form>
        )}
      </div>
    </div>
  );
}
