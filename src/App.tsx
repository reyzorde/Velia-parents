import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  CreditCard,
  Home,
  Loader2,
  LogOut,
  MessageSquare,
  Moon,
  Sun,
  Trophy,
} from 'lucide-react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { isConfigured, supabase } from './lib/supabase';

type Session = {
  parent_name: string;
  parent_phone: string;
  student_id: string;
  student_name: string;
};

type Tab = 'home' | 'attendance' | 'payments' | 'messages' | 'results';

function normalizePhone(raw: string) {
  return raw.replace(/[^\d+]/g, '');
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem('velia_parent_session_v2');
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session) {
  localStorage.setItem('velia_parent_session_v2', JSON.stringify(s));
}

function clearSession() {
  localStorage.removeItem('velia_parent_session_v2');
}

function Login() {
  const nav = useNavigate();
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isConfigured) {
      setError('.env faylida VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY yozing, keyin npm run dev ni qayta ishga tushiring.');
      return;
    }
    setBusy(true);
    try {
      const phone = normalizePhone(studentPhone);
      const name = studentName.trim();
      if (!phone || !name) throw new Error('Oquvchi ismi va telefonini kiriting.');

      const { data: rows, error: qErr } = await supabase
        .from('students')
        .select('id, full_name, phone, status')
        .eq('status', 'active')
        .ilike('full_name', name)
        .limit(20);
      if (qErr) throw new Error(qErr.message);

      const digits = phone.replace(/\D/g, '');
      const tail = digits.slice(-9);
      const matched = (rows || []).filter((s) => {
        const sp = (s.phone || '').replace(/\D/g, '');
        return sp.endsWith(tail) || sp.includes(tail) || (sp && tail.endsWith(sp.slice(-9)));
      });

      if (!matched.length) {
        throw new Error('Oquvchi topilmadi. Markazdagi ism va telefon togri ekanini tekshiring.');
      }
      const student = matched[0];

      saveSession({
        parent_name: parentName.trim() || 'Ota-ona',
        parent_phone: normalizePhone(parentPhone),
        student_id: student.id,
        student_name: student.full_name,
      });
      nav('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand__mark">V</div>
        <div className="auth-brand__name">Velia Parents</div>
      </div>
      <h1 className="auth-title">Farzandingizni kuzating</h1>
      <p className="auth-sub">
        Kirish uchun oquvchining <strong>toliq ismi</strong> va <strong>telefon raqami</strong> kerak. UUID kiritish shart emas.
      </p>
      <form onSubmit={submit}>
        {error && <div className="error-box">{error}</div>}
        <div className="field">
          <label>Sizning ismingiz</label>
          <input value={parentName} onChange={(e) => setParentName(e.target.value)} required autoComplete="name" />
        </div>
        <div className="field">
          <label>Sizning telefoningiz</label>
          <input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} required inputMode="tel" placeholder="+998 90 123 45 67" autoComplete="tel" />
        </div>
        <div className="field">
          <label>Oquvchi ismi (markazdagi)</label>
          <input value={studentName} onChange={(e) => setStudentName(e.target.value)} required autoComplete="off" />
        </div>
        <div className="field">
          <label>Oquvchi telefoni</label>
          <input value={studentPhone} onChange={(e) => setStudentPhone(e.target.value)} required inputMode="tel" placeholder="+998..." autoComplete="off" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ marginTop: 8 }}>
          {busy ? (<><Loader2 size={18} className="spin" /> Tekshirilmoqda</>) : 'Kirish'}
        </button>
      </form>
    </div>
  );
}

function HomeApp() {
  const nav = useNavigate();
  const session = useMemo(() => loadSession(), []);
  const [tab, setTab] = useState<Tab>('home');
  const [theme, setTheme] = useState(() => localStorage.getItem('velia_parents_theme') || 'light');
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
    if (!session) {
      nav('/login');
      return;
    }
    void (async () => {
      setLoading(true);
      const sid = session.student_id;
      const [att, pay, msg, res] = await Promise.all([
        supabase.from('attendance').select('date, status').eq('student_id', sid).order('date', { ascending: false }).limit(40),
        supabase.from('student_payments').select('amount, payment_date, note').eq('student_id', sid).order('payment_date', { ascending: false }).limit(40),
        supabase.from('student_messages').select('content, title, created_at').eq('student_id', sid).order('created_at', { ascending: false }).limit(40),
        supabase.from('mock_attempts').select('score, max_score, percentage, completed_at').eq('student_id', sid).order('completed_at', { ascending: false }).limit(20),
      ]);
      if (pay.error) {
        const alt = await supabase.from('payments').select('amount, payment_date, note').eq('student_id', sid).order('payment_date', { ascending: false }).limit(40);
        setPayments(alt.data || []);
      } else {
        setPayments(pay.data || []);
      }
      setAttendance(att.data || []);
      setMessages(msg.data || []);
      setResults(res.data || []);
      setLoading(false);
    })();
  }, [session, nav]);

  if (!session) return null;

  const tabs: Array<{ id: Tab; label: string; icon: typeof Home }> = [
    { id: 'home', label: 'Asosiy', icon: Home },
    { id: 'attendance', label: 'Davomat', icon: CalendarCheck },
    { id: 'payments', label: "Tolov", icon: CreditCard },
    { id: 'messages', label: 'Xabar', icon: MessageSquare },
    { id: 'results', label: 'Test', icon: Trophy },
  ];

  const presentCount = attendance.filter((a) => a.status === 'present').length;

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="auth-brand" style={{ marginBottom: 16 }}>
          <div className="auth-brand__mark">V</div>
          <div className="auth-brand__name">Parents</div>
        </div>
        {tabs.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <t.icon size={18} /> {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setTheme((x) => (x === 'light' ? 'dark' : 'light'))}>
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />} Rejim
        </button>
        <button type="button" onClick={() => { clearSession(); nav('/login'); }}>
          <LogOut size={18} /> Chiqish
        </button>
      </aside>

      <div>
        <header className="app-header">
          <div>
            <h1>{session.student_name}</h1>
            <div className="sub">{session.parent_name} · {session.parent_phone}</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setTheme((x) => (x === 'light' ? 'dark' : 'light'))} aria-label="Theme">
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => { clearSession(); nav('/login'); }} aria-label="Chiqish">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="app-main">
          {loading ? (
            <div className="card empty"><Loader2 className="spin" size={24} /> Yuklanmoqda...</div>
          ) : tab === 'home' ? (
            <>
              <div className="card hero-card">
                <div className="muted">Farzandingiz</div>
                <div className="hero-name">{session.student_name}</div>
                <div className="muted">Velia orqali kuzatuv</div>
              </div>
              <div className="stat-grid">
                <div className="stat"><div className="label">Davomat</div><div className="value">{presentCount}/{attendance.length || 0}</div></div>
                <div className="stat"><div className="label">Tolovlar</div><div className="value">{payments.length}</div></div>
                <div className="stat"><div className="label">Xabarlar</div><div className="value">{messages.length}</div></div>
                <div className="stat"><div className="label">Testlar</div><div className="value">{results.length}</div></div>
              </div>
              <div className="card">
                <h2>Tezkor holat</h2>
                <div className="row"><span className="muted">Songgi davomat</span><strong>{attendance[0] ? attendance[0].date : '—'}</strong></div>
                <div className="row"><span className="muted">Songgi tolov</span><strong>{payments[0] ? `${Number(payments[0].amount).toLocaleString()} som` : '—'}</strong></div>
              </div>
            </>
          ) : tab === 'attendance' ? (
            <div className="card">
              <h2>Davomat</h2>
              {!attendance.length && <div className="empty">Hali yozuv yoq</div>}
              {attendance.map((a, i) => (
                <div className="row" key={i}>
                  <span>{a.date}</span>
                  <span className={`badge ${a.status === 'present' ? 'ok' : a.status === 'absent' ? 'danger' : 'warn'}`}>{a.status}</span>
                </div>
              ))}
            </div>
          ) : tab === 'payments' ? (
            <div className="card">
              <h2>Tolovlar</h2>
              {!payments.length && <div className="empty">Hali tolov yoq</div>}
              {payments.map((p, i) => (
                <div className="row" key={i}>
                  <div><div>{p.payment_date}</div>{p.note && <div className="muted">{p.note}</div>}</div>
                  <strong>{Number(p.amount).toLocaleString()} som</strong>
                </div>
              ))}
            </div>
          ) : tab === 'messages' ? (
            <div className="card">
              <h2>Xabarlar</h2>
              {!messages.length && <div className="empty">Xabar yoq</div>}
              {messages.map((m, i) => (
                <div className="msg-item" key={i}>
                  <div className="muted">{new Date(m.created_at).toLocaleString()}</div>
                  {m.title && <strong>{m.title}</strong>}
                  <div>{m.content}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card">
              <h2>Mock test natijalari</h2>
              {!results.length && <div className="empty">Natija yoq</div>}
              {results.map((r, i) => (
                <div className="row" key={i}>
                  <span className="muted">{r.completed_at ? new Date(r.completed_at).toLocaleDateString() : '—'}</span>
                  <strong>{r.score ?? 0}/{r.max_score ?? 0}{r.percentage != null ? ` · ${r.percentage}%` : ''}</strong>
                </div>
              ))}
            </div>
          )}
        </main>

        <nav className="bottom-nav" aria-label="Asosiy navigatsiya">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <t.icon size={20} />
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<HomeApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
