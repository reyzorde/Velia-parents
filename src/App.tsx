import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { supabase, isConfigured } from './lib/supabase';

type Session = {
  phone: string;
  full_name: string;
  student_id: string;
};

type Student = {
  id: string;
  full_name: string;
  phone: string | null;
  status: string;
  center_id: string;
};

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem('velia_parent_session');
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session) {
  localStorage.setItem('velia_parent_session', JSON.stringify(s));
}

function clearSession() {
  localStorage.removeItem('velia_parent_session');
}

function Login() {
  const nav = useNavigate();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isConfigured) {
      setError('.env da VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY yozing, serverni qayta ishga tushiring.');
      return;
    }
    setBusy(true);
    try {
      const id = studentId.trim();
      const { data: student, error: sErr } = await supabase
        .from('students')
        .select('id, full_name, status, center_id')
        .eq('id', id)
        .maybeSingle();

      if (sErr || !student) {
        throw new Error("O‘quvchi topilmadi. Markaz egasidan to‘g‘ri o‘quvchi ID oling.");
      }
      if (student.status !== 'active') {
        throw new Error('Bu o‘quvchi nofaol holatda.');
      }

      // optional parent_links upsert (ignore failure if table missing)
      try {
        await supabase.from('parent_links').upsert(
          {
            parent_user_id: null,
            student_id: student.id,
          },
          { onConflict: 'student_id', ignoreDuplicates: true }
        );
      } catch {
        /* ignore */
      }

      saveSession({
        phone: phone.trim(),
        full_name: fullName.trim() || 'Ota-ona',
        student_id: student.id,
      });
      nav('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand">Velia Parents</div>
      </div>
      <div className="card">
        <h2>Farzandingizni kuzating</h2>
        <p className="muted">
          Kirish uchun markaz bergan <strong>o‘quvchi ID</strong> kerak. Yangi hisob ochilmaydi — faqat Velia dagi o‘quvchi.
        </p>
        <form onSubmit={submit}>
          <label className="label">Ismingiz</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <label className="label">Telefon</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+998..." />
          <label className="label">O‘quvchi ID (UUID)</label>
          <input
            className="input"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            required
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={busy} style={{ marginTop: 16, width: '100%' }}>
            {busy ? 'Tekshirilmoqda...' : 'Kirish'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Home() {
  const nav = useNavigate();
  const session = useMemo(() => loadSession(), []);
  const [student, setStudent] = useState<Student | null>(null);
  const [tab, setTab] = useState<'overview' | 'attendance' | 'payments' | 'messages' | 'results'>('overview');
  const [attendance, setAttendance] = useState<Array<{ date: string; status: string }>>([]);
  const [payments, setPayments] = useState<Array<{ amount: number; payment_date: string; note: string | null }>>([]);
  const [messages, setMessages] = useState<Array<{ content: string; title: string | null; created_at: string; message_type: string }>>([]);
  const [results, setResults] = useState<Array<{ score: number | null; max_score: number | null; percentage: number | null; completed_at: string | null; test_id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem('velia_parents_theme') || 'light');

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
      const { data: st } = await supabase.from('students').select('*').eq('id', sid).maybeSingle();
      setStudent(st as Student | null);

      const [att, pay, msg, res] = await Promise.all([
        supabase.from('attendance').select('date, status').eq('student_id', sid).order('date', { ascending: false }).limit(30),
        supabase
          .from('payments')
          .select('amount, payment_date, note')
          .eq('student_id', sid)
          .order('payment_date', { ascending: false })
          .limit(30),
        supabase
          .from('student_messages')
          .select('content, title, created_at, message_type')
          .eq('student_id', sid)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('mock_attempts')
          .select('score, max_score, percentage, completed_at, test_id')
          .eq('student_id', sid)
          .order('completed_at', { ascending: false })
          .limit(20),
      ]);

      // payments view might fail — try student_payments
      if (pay.error) {
        const alt = await supabase
          .from('student_payments')
          .select('amount, payment_date, note')
          .eq('student_id', sid)
          .order('payment_date', { ascending: false })
          .limit(30);
        setPayments((alt.data as typeof payments) || []);
      } else {
        setPayments((pay.data as typeof payments) || []);
      }

      setAttendance(att.data || []);
      setMessages(msg.data || []);
      setResults((res.data as typeof results) || []);
      setLoading(false);
    })();
  }, [session, nav]);

  if (!session) return null;

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="brand">Velia Parents</div>
          <div className="muted">
            {session.full_name} · {session.phone}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secondary" type="button" onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>
            {theme === 'light' ? 'Tungi' : 'Kunduzgi'}
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              clearSession();
              nav('/login');
            }}
          >
            Chiqish
          </button>
        </div>
      </div>

      <div className="card">
        <h2>{student?.full_name || 'O‘quvchi'}</h2>
        <p className="muted" style={{ margin: 0 }}>
          ID: <code style={{ fontSize: 12 }}>{session.student_id}</code>
          {student?.status === 'active' ? (
            <span className="badge ok" style={{ marginLeft: 8 }}>
              Faol
            </span>
          ) : (
            <span className="badge warn" style={{ marginLeft: 8 }}>
              {student?.status || '...'}
            </span>
          )}
        </p>
      </div>

      <div className="tabs">
        {(
          [
            ['overview', 'Umumiy'],
            ['attendance', 'Davomat'],
            ['payments', "To‘lovlar"],
            ['messages', 'Xabarlar'],
            ['results', 'Test natijalari'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card empty">Yuklanmoqda...</div>
      ) : tab === 'overview' ? (
        <div className="card">
          <h2>Qisqa ko‘rinish</h2>
          <div className="row">
            <span className="muted">So‘nggi davomat</span>
            <strong>{attendance[0] ? `${attendance[0].date} · ${attendance[0].status}` : '—'}</strong>
          </div>
          <div className="row">
            <span className="muted">So‘nggi to‘lov</span>
            <strong>
              {payments[0]
                ? `${Number(payments[0].amount).toLocaleString()} so‘m · ${payments[0].payment_date}`
                : '—'}
            </strong>
          </div>
          <div className="row">
            <span className="muted">Yangi xabarlar</span>
            <strong>{messages.length}</strong>
          </div>
          <div className="row">
            <span className="muted">Mock natijalar</span>
            <strong>{results.length}</strong>
          </div>
        </div>
      ) : tab === 'attendance' ? (
        <div className="card">
          <h2>Davomat</h2>
          {attendance.length === 0 && <div className="empty">Ma’lumot yo‘q</div>}
          {attendance.map((a, i) => (
            <div className="row" key={i}>
              <span>{a.date}</span>
              <span className={`badge ${a.status === 'present' ? 'ok' : a.status === 'absent' ? 'danger' : 'warn'}`}>
                {a.status}
              </span>
            </div>
          ))}
        </div>
      ) : tab === 'payments' ? (
        <div className="card">
          <h2>To‘lovlar</h2>
          {payments.length === 0 && <div className="empty">Ma’lumot yo‘q</div>}
          {payments.map((p, i) => (
            <div className="row" key={i}>
              <span>{p.payment_date}</span>
              <strong>{Number(p.amount).toLocaleString()} so‘m</strong>
            </div>
          ))}
        </div>
      ) : tab === 'messages' ? (
        <div className="card">
          <h2>Xabarlar (ilova ichida)</h2>
          {messages.length === 0 && <div className="empty">Hali xabar yo‘q</div>}
          {messages.map((m, i) => (
            <div key={i} style={{ borderTop: i ? '1px solid var(--border)' : undefined, paddingTop: 10, marginTop: i ? 10 : 0 }}>
              <div className="muted">{new Date(m.created_at).toLocaleString()}</div>
              {m.title && <strong>{m.title}</strong>}
              <div>{m.content}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <h2>Mock test natijalari</h2>
          {results.length === 0 && <div className="empty">Natija yo‘q</div>}
          {results.map((r, i) => (
            <div className="row" key={i}>
              <span className="muted">{r.completed_at ? new Date(r.completed_at).toLocaleDateString() : '—'}</span>
              <strong>
                {r.score ?? 0} / {r.max_score ?? 0}
                {r.percentage != null ? ` (${r.percentage}%)` : ''}
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
