c:\Users\Ustoz\Downloads\velia-fixes\HomeApp.tsximport { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logoLight from '../assets/velia-logo.png';
import logoDark from '../assets/velia-night-logo.png';
import { clearStoredOtp, generateOtp, sendOtpEmail, verifyStoredOtp } from '../lib/otp';
import { isConfigured, supabase } from '../lib/supabase';

type AuthStep = 'email' | 'otp' | 'password' | 'login';

function authErrorMessage(err: { message?: string; status?: number } | null): string {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('already') || msg.includes('registered') || err?.status === 422) {
    return 'Bu email allaqachon ro\'yxatdan o\'tgan. «Parol bilan kirish» orqali kiring.';
  }
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return 'Email yoki parol noto\'g\'ri. Avval kod bilan emailni tasdiqlab parol o\'rnating.';
  }
  if (msg.includes('rate limit') || msg.includes('email rate')) {
    return 'Juda ko\'p urinish. Bir daqiqadan keyin qayta urinib ko\'ring.';
  }
  return err?.message || 'Xatolik yuz berdi';
}

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
  const [theme, setTheme] = useState(() => localStorage.getItem('velia_parents_theme') || 'dark');
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const mail = email.trim().toLowerCase();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('velia_parents_theme', theme);
  }, [theme]);

  const sendCode = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      setError('');
      setInfo('');
      if (!isConfigured) {
        setError('.env da Supabase va EmailJS kalitlarini yozing.');
        return;
      }
      if (!mail.includes('@')) {
        setError('Email noto\'g\'ri');
        return;
      }
      setBusy(true);
      try {
        const otp = generateOtp();
        await sendOtpEmail(mail, otp);
        setStep('otp');
        setInfo('Kod emailga yuborildi (10 daqiqa amal qiladi).');
        setOtpCode('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Kod yuborilmadi');
      } finally {
        setBusy(false);
      }
    },
    [mail]
  );

  const checkOtp = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (otpCode.trim().length !== 6) {
      setError('6 xonali kodni kiriting');
      return;
    }
    if (!verifyStoredOtp(mail, otpCode)) {
      setError('Kod noto\'g\'ri yoki muddati o\'tgan');
      return;
    }
    clearStoredOtp();
    setStep('password');
    setInfo('Email tasdiqlandi. Endi parol o\'rnating.');
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
    try {
      const { error: loginTry } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (!loginTry) {
        nav('/', { replace: true });
        return;
      }
      const { data: signed, error: signErr } = await supabase.auth.signUp({
        email: mail,
        password,
        options: { data: { role: 'parent' } },
      });
      if (signErr) {
        if (signErr.status === 422 || /already|registered|exists|duplicate/i.test(signErr.message)) {
          throw new Error('Bu email allaqachon bor. To\'g\'ri parol bilan «Parol bilan kirish» ni bosing.');
        }
        throw new Error(authErrorMessage(signErr));
      }
      if (signed.session) {
        nav('/', { replace: true });
        return;
      }
      const { error: after } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (after) {
        throw new Error('Hisob yaratildi. Supabase Confirm email ni OCHIRING, keyin kiring.');
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
      const { error: loginErr } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (loginErr) throw new Error(authErrorMessage(loginErr));
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
    setOtpCode(arr.join('').replace(/ /g, '').slice(0, 6));
    otpRefs.current[Math.min(index + digits.length, 5)]?.focus();
  };

  return (
    <div className="auth">
      <div className="glass auth-card">
        <div className="brand">
          <img src={theme === 'dark' ? logoDark : logoLight} alt="Velia" className="brand-logo" />
          <div className="brand-name">Parents</div>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            style={{ marginLeft: 'auto' }}
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label="Theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
        <h1>
          {step === 'email' && 'Email'}
          {step === 'otp' && 'Kodni tasdiqlang'}
          {step === 'password' && 'Parol o\'rnating'}
          {step === 'login' && 'Kirish'}
        </h1>
        <p className="sub">
          {step === 'email' && 'Avval emailga kod yuboriladi. Tasdiqlagach parol o\'rnatasiz.'}
          {step === 'otp' && `${email} manziliga yuborilgan 6 xonali kod.`}
          {step === 'password' && 'Shu parol bilan keyin Parentsga kirasiz.'}
          {step === 'login' && 'Parol o\'rnatgan bo\'lsangiz — email va parol bilan kiring.'}
        </p>
        {error && <div className="error">{error}</div>}
        {info && !error && <p className="sub" style={{ color: 'var(--ok, #34d399)' }}>{info}</p>}
        {step === 'email' && (
          <form onSubmit={sendCode}>
            <div className="field">
              <label>Email</label>
              <input type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : null}
              {busy ? '...' : 'Kod yuborish'}
            </button>
            <button className="btn btn-ghost" type="button" style={{ width: '100%', marginTop: 10 }} onClick={() => { setStep('login'); setError(''); setInfo(''); }}>
              Parol bilan kirish
            </button>
          </form>
        )}
        {step === 'otp' && (
          <form onSubmit={checkOtp}>
            <div className="field">
              <label>Tasdiqlash kodi</label>
              <div className="otp-row">
                {Array.from({ length: 6 }).map((_, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    value={otpCode[i] || ''}
                    onChange={(e) => updateOtpDigit(e.target.value, i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !otpCode[i] && i > 0) otpRefs.current[i - 1]?.focus();
                    }}
                  />
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
            <input type="email" name="username" autoComplete="username" value={mail} readOnly hidden aria-hidden />
            <div className="field">
              <label>Yangi parol</label>
              <input type="password" name="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div className="field">
              <label>Parolni tasdiqlang</label>
              <input type="password" name="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : null}
              Parolni saqlash va kirish
            </button>
          </form>
        )}
        {step === 'login' && (
          <form onSubmit={loginWithPassword}>
            <div className="field">
              <label>Email</label>
              <input type="email" name="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Parol</label>
              <input type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : null}
              Kirish
            </button>
            <button className="btn btn-ghost" type="button" style={{ width: '100%', marginTop: 10 }} onClick={() => { setStep('email'); setError(''); }}>
              Kod bilan parol o\'rnatish
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
