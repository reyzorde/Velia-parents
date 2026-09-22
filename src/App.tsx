import { FormEvent, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  CalendarCheck, CreditCard, Home, Loader2, LogOut, MessageSquare, Moon, Sun, Trophy,
} from 'lucide-react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { isConfigured, supabase } from './lib/supabase';

type Tab = 'home' | 'attendance' | 'payments' | 'messages' | 'results';
type Child = { id: string; full_name: string; status: string };

function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isConfigured) {
      setError('.env da VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY yozing.');
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError) {
        throw new Error(
          authError.message.includes('Invalid')
            ? 'Email yoki parol notogri. Avval Velia da email tasdiqlab, parol ornating.'
            : authError.message
        );
      }
      nav('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kirishda xatolik');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="glass auth-card">
        <div className="brand">
          <div className="brand-mark">V</div>
          <div className="brand-name">Velia Parents</div>
        </div>
        <h1>Kirish</h1>
        <p className="sub">
          Royxatdan otish yoq. Emailni bir marta Velia da tasdiqlab, parol ornatgan bolsangiz — shu email va parol bilan kirasiz.
        </p>
        <form onSubmit={submit}>
          {error && <div className="error">{error}</div>}
          <div className="field">
            <label>Email</label>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Parol</label>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : null}
            {busy ? 'Kirilmoqda...' : 'Kirish'}
          </button>
        </form>
      </div>
    </div>
  );
}

function HomeApp({ user }: { user: User }) {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('home');
  const [theme, setTheme] = useState(() => localStorage.getItem('velia_parents_theme') || 'dark');
  const [children, setChildren] = useState<Child[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<Array<{ date: string; status: string }>>([]);
  const [payments, setPayments] = useState<Array<{ amount: number; payment_date: string; note: string | null }>>([]);
  const [messages, setMessages] = useState<Array<{ content: string; title: string | null; created_at: string }>>([]);
  const [results, setResults] = useState<Array<{ score: number | null; max_score: number | null; percentage: number | null; completed_at: string | null }>>([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('velia_parents_theme', theme);
  }, [theme]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data: links } = await supabase
        .from('parent_links')
        .select('student_id, students(id, full_name, status)')
        .eq('parent_user_id', user.id);

      let kids: Child[] = [];
      if (links?.length) {
        kids = links
          .map((row: any) => {
            const s = Array.isArray(row.students) ? row.students[0] : row.students;
            return s ? { id: s.id as string, full_name: s.full_name as string, status: s.status as string } : null;
          })
          .filter(Boolean) as Child[];
      }
      if (!kids.length && user.email) {
        const { data: byEmail } = await supabase
          .from('students')
          .select('id, full_name, status')
          .ilike('email', user.email)
          .limit(10);
        kids = (byEmail || []).map((s) => ({ id: s.id, full_name: s.full_name, status: s.status }));
      }
      setChildren(kids);
      setActiveId(kids[0]?.id || null);
      setLoading(false);
    })();
  }, [user.id, user.email]);

  useEffect(() => {
    if (!activeId) return;
    void (async () => {
      const [att, pay, msg, res] = await Promise.all([
        supabase.from('attendance').select('date, status').eq('student_id', activeId).order('date', { ascending: false }).limit(40),
        supabase.from('student_payments').select('amount, payment_date, note').eq('student_id', activeId).order('payment_date', { ascending: false }).limit(40),
        supabase.from('student_messages').select('content, title, created_at').eq('student_id', activeId).order('created_at', { ascending: false }).limit(40),
        supabase.from('mock_attempts').select('score, max_score, percentage, completed_at').eq('student_id', activeId).order('completed_at', { ascending: false }).limit(20),
      ]);
      if (pay.error) {
        const alt = await supabase.from('payments').select('amount, payment_date, note').eq('student_id', activeId).order('payment_date', { ascending: false }).limit(40);
        setPayments(alt.data || []);
      } else setPayments(pay.data || []);
      setAttendance(att.data || []);
      setMessages(msg.data || []);
      setResults(res.data || []);
    })();
  }, [activeId]);

  const child = children.find((c) => c.id === activeId);
  const tabs: Array<{ id: Tab; label: string; icon: typeof Home }> = [
    { id: 'home', label: 'Asosiy', icon: Home },
    { id: 'attendance', label: 'Davomat', icon: CalendarCheck },
    { id: 'payments', label: 'Tolov', icon: CreditCard },
    { id: 'messages', label: 'Xabar', icon: MessageSquare },
    { id: 'results', label: 'Test', icon: Trophy },
  ];

  const logout = async () => {
    await supabase.auth.signOut();
    nav('/login', { replace: true });
  };

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand" style={{ margin: 0 }}>
          <div className="brand-mark">V</div>
          <div>
            <div className="brand-name">Parents</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{user.email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => void logout()}>
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="glass card empty"><Loader2 className="spin" size={22} /> Yuklanmoqda...</div>
      ) : !children.length ? (
        <div className="glass card">
          <h3>Farzand boglanmagan</h3>
          <p className="sub" style={{ margin: 0 }}>
            Markaz sizni parent_links orqali boglab berishi yoki oquvchi emailingiz bilan bir xil bolishi kerak.
          </p>
        </div>
      ) : (
        <>
          {children.length > 1 && (
            <div className="glass card" style={{ padding: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Farzand</label>
              <select
                style={{ width: '100%', marginTop: 6, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--glass-2)', color: 'inherit' }}
                value={activeId || ''}
                onChange={(e) => setActiveId(e.target.value)}
              >
                {children.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="desktop-tabs">
            {tabs.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>

          {tab === 'home' && (
            <>
              <div className="glass hero">
                <div style={{ opacity: 0.85, fontSize: 13 }}>Farzandingiz</div>
                <h2>{child?.full_name || '—'}</h2>
                <span className={`badge ${child?.status === 'active' ? 'ok' : 'warn'}`}>{child?.status || '—'}</span>
              </div>
              <div className="stats">
                <div className="glass stat"><div className="l">Davomat</div><div className="v">{attendance.length}</div></div>
                <div className="glass stat"><div className="l">Tolovlar</div><div className="v">{payments.length}</div></div>
                <div className="glass stat"><div className="l">Xabarlar</div><div className="v">{messages.length}</div></div>
                <div className="glass stat"><div className="l">Testlar</div><div className="v">{results.length}</div></div>
              </div>
            </>
          )}

          {tab === 'attendance' && (
            <div className="glass card">
              <h3>Davomat</h3>
              {!attendance.length && <div className="empty">Malumot yoq</div>}
              {attendance.map((a, i) => (
                <div className="row" key={i}>
                  <span>{a.date}</span>
                  <span className={`badge ${a.status === 'present' ? 'ok' : a.status === 'absent' ? 'danger' : 'warn'}`}>{a.status}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'payments' && (
            <div className="glass card">
              <h3>Tolovlar</h3>
              {!payments.length && <div className="empty">Malumot yoq</div>}
              {payments.map((p, i) => (
                <div className="row" key={i}>
                  <div>
                    <div>{p.payment_date}</div>
                    {p.note && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.note}</div>}
                  </div>
                  <strong>{Number(p.amount).toLocaleString()} som</strong>
                </div>
              ))}
            </div>
          )}

          {tab === 'messages' && (
            <div className="glass card">
              <h3>Xabarlar</h3>
              {!messages.length && <div className="empty">Xabar yoq</div>}
              {messages.map((m, i) => (
                <div key={i} style={{ borderTop: i ? '1px solid var(--border)' : undefined, paddingTop: 10, marginTop: i ? 10 : 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(m.created_at).toLocaleString()}</div>
                  {m.title && <strong>{m.title}</strong>}
                  <div>{m.content}</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'results' && (
            <div className="glass card">
              <h3>Mock natijalar</h3>
              {!results.length && <div className="empty">Natija yoq</div>}
              {results.map((r, i) => (
                <div className="row" key={i}>
                  <span style={{ color: 'var(--muted)' }}>{r.completed_at ? new Date(r.completed_at).toLocaleDateString() : '—'}</span>
                  <strong>{r.score ?? 0}/{r.max_score ?? 0}{r.percentage != null ? ` · ${r.percentage}%` : ''}</strong>
                </div>
              ))}
            </div>
          )}

          <nav className="glass bottom-nav">
            {tabs.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                <t.icon size={18} />
                {t.label}
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}

function Gate() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="auth"><Loader2 className="spin" size={28} /></div>;
  if (!session?.user) return <Navigate to="/login" replace />;
  return <HomeApp user={session.user} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Gate />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
