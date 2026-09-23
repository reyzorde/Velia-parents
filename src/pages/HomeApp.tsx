import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  CalendarCheck, CreditCard, Home, Inbox, Loader2, LogOut, MessageSquare, Moon, Sun, Trophy,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logoLight from '../assets/velia-logo.png';
import logoDark from '../assets/velia-night-logo.png';
import { supabase } from '../lib/supabase';

type Tab = 'home' | 'attendance' | 'payments' | 'messages' | 'results';
type Child = { id: string; full_name: string; status: string; center_id?: string | null };

const TABS: Array<{ id: Tab; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Asosiy', icon: Home },
  { id: 'attendance', label: 'Davomat', icon: CalendarCheck },
  { id: 'payments', label: 'Tolov', icon: CreditCard },
  { id: 'messages', label: 'Xabar', icon: MessageSquare },
  { id: 'results', label: 'Test', icon: Trophy },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function ensureProfile(user: User) {
  try {
    await supabase.rpc('ensure_own_profile', {
      p_full_name: (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'Parent',
      p_email: user.email || '',
    });
  } catch {
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email || '',
      full_name: (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'Parent',
    }, { onConflict: 'id' });
  }
}

export default function HomeApp({ user }: { user: User }) {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('home');
  const [theme, setTheme] = useState(() => localStorage.getItem('velia_parents_theme') || 'dark');
  const [children, setChildren] = useState<Child[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [linkId, setLinkId] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState('');
  const [counts, setCounts] = useState({ attendance: 0, payments: 0, messages: 0, results: 0 });
  const [attendance, setAttendance] = useState<Array<{ date: string; status: string }>>([]);
  const [payments, setPayments] = useState<Array<{ amount: number; payment_date: string; note: string | null }>>([]);
  const [messages, setMessages] = useState<Array<{ content: string; title: string | null; created_at: string }>>([]);
  const [results, setResults] = useState<Array<{ score: number | null; max_score: number | null; percentage: number | null; completed_at: string | null }>>([]);
  const loadedTabs = useMemo(() => new Set<string>(), []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('velia_parents_theme', theme);
  }, [theme]);

  const loadChildren = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      await ensureProfile(user);

      const kidsMap = new Map<string, Child>();

      const { data: links, error: linkErr } = await supabase
        .from('parent_links')
        .select('student_id')
        .eq('parent_user_id', user.id);
      if (linkErr && !/does not exist/i.test(linkErr.message)) setLoadError(linkErr.message);

      const linkedIds = (links || []).map((l) => l.student_id).filter(Boolean) as string[];
      if (linkedIds.length) {
        const { data: byIds, error: stErr } = await supabase
          .from('students')
          .select('id, full_name, status, center_id')
          .in('id', linkedIds);
        if (stErr) setLoadError((prev) => prev || stErr.message);
        for (const s of byIds || []) {
          kidsMap.set(s.id, { id: s.id, full_name: s.full_name, status: s.status, center_id: s.center_id });
        }
      }

      if (user.email) {
        const { data: byEmail } = await supabase
          .from('students')
          .select('id, full_name, status, center_id')
          .ilike('email', user.email)
          .limit(20);
        for (const s of byEmail || []) {
          kidsMap.set(s.id, { id: s.id, full_name: s.full_name, status: s.status, center_id: s.center_id });
        }
      }

      const kids = Array.from(kidsMap.values());
      setChildren(kids);
      setActiveId((prev) => (prev && kids.some((k) => k.id === prev) ? prev : kids[0]?.id || null));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Yuklash xatosi');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void loadChildren(); }, [loadChildren]);

  const linkStudent = async (e: FormEvent) => {
    e.preventDefault();
    setLinkMsg('');
    const id = linkId.trim();
    if (!UUID_RE.test(id)) {
      setLinkMsg("O'quvchi ID to'liq UUID bo'lishi kerak (Velia → O'quvchilar sahifasidan).");
      return;
    }
    setLinkBusy(true);
    try {
      await ensureProfile(user);
      const { data: st, error: stErr } = await supabase
        .from('students')
        .select('id, full_name, status, center_id')
        .eq('id', id)
        .maybeSingle();

      if (stErr) {
        throw new Error(
          stErr.message.includes('policy') || stErr.code === '42501' || stErr.code === 'PGRST301'
            ? "RLS bloklayapti. Supabase da FIX_RLS_NOW.sql ni ishga tushiring."
            : stErr.message
        );
      }
      if (!st) {
        throw new Error("O'quvchi topilmadi. ID ni tekshiring yoki o'quvchi emailini parent email bilan bir xil qiling.");
      }

      const { error: insErr } = await supabase.from('parent_links').upsert(
        { parent_user_id: user.id, student_id: id },
        { onConflict: 'parent_user_id,student_id' }
      );
      if (insErr) {
        throw new Error(
          insErr.message.includes('policy') || insErr.code === '42501'
            ? "Bog'lashga ruxsat yo'q. FIX_RLS_NOW.sql ni ishga tushiring."
            : insErr.message
        );
      }
      setLinkMsg(st.full_name + " bog'landi.");
      setLinkId('');
      await loadChildren();
    } catch (err) {
      setLinkMsg(err instanceof Error ? err.message : "Bog'lash xatosi");
    } finally {
      setLinkBusy(false);
    }
  };

  const loadTab = useCallback(async (t: Tab, studentId: string) => {
    const key = studentId + ':' + t;
    if (loadedTabs.has(key) && t !== 'home') return;
    setTabLoading(true);
    const child = children.find((c) => c.id === studentId);
    try {
      if (t === 'home') {
        const [a, p, m, r] = await Promise.all([
          supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('student_id', studentId),
          supabase.from('student_payments').select('id', { count: 'exact', head: true }).eq('student_id', studentId),
          supabase.from('student_messages').select('id', { count: 'exact', head: true }).eq('student_id', studentId),
          supabase.from('mock_attempts').select('id', { count: 'exact', head: true }).eq('student_id', studentId),
        ]);
        let payCount = p.count ?? 0;
        if (p.error) {
          const alt = await supabase.from('payments').select('id', { count: 'exact', head: true }).eq('student_id', studentId);
          payCount = alt.count ?? 0;
        }
        setCounts({ attendance: a.count ?? 0, payments: payCount, messages: m.count ?? 0, results: r.count ?? 0 });
      } else if (t === 'attendance') {
        const { data } = await supabase.from('attendance').select('date, status').eq('student_id', studentId).order('date', { ascending: false }).limit(40);
        setAttendance(data || []);
      } else if (t === 'payments') {
        const { data, error } = await supabase.from('student_payments').select('amount, payment_date, note').eq('student_id', studentId).order('payment_date', { ascending: false }).limit(40);
        if (error) {
          const alt = await supabase.from('payments').select('amount, payment_date, note').eq('student_id', studentId).order('payment_date', { ascending: false }).limit(40);
          setPayments(alt.data || []);
        } else setPayments(data || []);
      } else if (t === 'messages') {
        let q = supabase
          .from('student_messages')
          .select('content, title, created_at, student_id')
          .order('created_at', { ascending: false })
          .limit(50);
        if (child?.center_id) {
          q = q.eq('center_id', child.center_id).or(`student_id.eq.${studentId},student_id.is.null`);
        } else {
          q = q.eq('student_id', studentId);
        }
        const { data } = await q;
        setMessages(data || []);
      } else if (t === 'results') {
        const { data } = await supabase.from('mock_attempts').select('score, max_score, percentage, completed_at').eq('student_id', studentId).order('completed_at', { ascending: false }).limit(20);
        setResults(data || []);
      }
      loadedTabs.add(key);
    } finally {
      setTabLoading(false);
    }
  }, [loadedTabs, children]);

  useEffect(() => {
    if (!activeId) return;
    void loadTab(tab, activeId);
  }, [activeId, tab, loadTab]);

  useEffect(() => {
    loadedTabs.clear();
    setAttendance([]);
    setPayments([]);
    setMessages([]);
    setResults([]);
  }, [activeId, loadedTabs]);

  const child = children.find((c) => c.id === activeId);

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand" style={{ margin: 0 }}>
          <img src={theme === 'dark' ? logoDark : logoLight} alt="Velia" className="brand-logo" />
          <div>
            <div className="brand-name">Parents</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{user.email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} aria-label="Theme">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={async () => { await supabase.auth.signOut(); nav('/login', { replace: true }); }} aria-label="Chiqish">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {loadError && <div className="error" style={{ marginBottom: 12 }}>{loadError}</div>}

      {loading ? (
        <div className="glass card empty"><Loader2 className="spin" size={22} /></div>
      ) : !children.length ? (
        <div className="glass card">
          <div className="empty-icon"><Inbox size={28} /></div>
          <h3>Farzand bog'lanmagan</h3>
          <p className="sub">
            Velia → O'quvchilar sahifasidan o'quvchi ID (UUID) ni oling. Yoki o'quvchi emailini shu parent email bilan bir xil qiling.
          </p>
          <form onSubmit={linkStudent}>
            <div className="field">
              <label>O'quvchi ID (UUID)</label>
              <input value={linkId} onChange={(e) => setLinkId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" />
            </div>
            {linkMsg && <p className="sub">{linkMsg}</p>}
            <button className="btn btn-primary" type="submit" disabled={linkBusy}>
              {linkBusy ? <Loader2 className="spin" size={18} /> : null}
              Farzandni bog'lash
            </button>
          </form>
        </div>
      ) : (
        <>
          {children.length > 1 && (
            <div className="glass card" style={{ padding: 12 }}>
              <select
                className="input"
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
            {TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
          {tabLoading && tab !== 'home' && (
            <div className="glass card empty"><Loader2 className="spin" size={20} /></div>
          )}
          {tab === 'home' && (
            <>
              <div className="glass hero">
                <div style={{ opacity: 0.85, fontSize: 13 }}>Farzandingiz</div>
                <h2>{child?.full_name}</h2>
                <span className={`badge ${child?.status === 'active' ? 'ok' : 'warn'}`}>{child?.status}</span>
              </div>
              <div className="stats">
                <button type="button" className="glass stat" onClick={() => setTab('attendance')}><div className="l">Davomat</div><div className="v">{counts.attendance}</div></button>
                <button type="button" className="glass stat" onClick={() => setTab('payments')}><div className="l">To'lov</div><div className="v">{counts.payments}</div></button>
                <button type="button" className="glass stat" onClick={() => setTab('messages')}><div className="l">Xabar</div><div className="v">{messages.length || counts.messages}</div></button>
                <button type="button" className="glass stat" onClick={() => setTab('results')}><div className="l">Test</div><div className="v">{counts.results}</div></button>
              </div>
            </>
          )}
          {tab === 'attendance' && !tabLoading && (
            <div className="glass card">
              <h3>Davomat</h3>
              {!attendance.length && <div className="empty">Hali davomat yo'q</div>}
              {attendance.map((a, i) => (
                <div className="row" key={i}>
                  <span>{a.date}</span>
                  <span className={`badge ${a.status === 'present' ? 'ok' : a.status === 'absent' ? 'danger' : 'warn'}`}>{a.status}</span>
                </div>
              ))}
            </div>
          )}
          {tab === 'payments' && !tabLoading && (
            <div className="glass card">
              <h3>To'lovlar</h3>
              {!payments.length && <div className="empty">Hali to'lov yo'q</div>}
              {payments.map((p, i) => (
                <div className="row" key={i}>
                  <span>{p.payment_date}</span>
                  <strong>{Number(p.amount).toLocaleString()} so'm</strong>
                </div>
              ))}
            </div>
          )}
          {tab === 'messages' && !tabLoading && (
            <div className="glass card">
              <h3>Xabarlar</h3>
              {!messages.length && (
                <div className="empty">
                  Hali xabar yo'q. Markaz Velia ilovasidan xabar yuborsa shu yerda chiqadi.
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className="msg-item">
                  <div className="msg-time">{new Date(m.created_at).toLocaleString()}</div>
                  {m.title && <strong>{m.title}</strong>}
                  <div className="msg-body">{m.content}</div>
                </div>
              ))}
            </div>
          )}
          {tab === 'results' && !tabLoading && (
            <div className="glass card">
              <h3>Testlar</h3>
              {!results.length && <div className="empty">Hali test natijasi yo'q</div>}
              {results.map((r, i) => (
                <div className="row" key={i}>
                  <span style={{ color: 'var(--muted)' }}>{r.completed_at ? new Date(r.completed_at).toLocaleDateString() : '—'}</span>
                  <strong>{r.score ?? 0}/{r.max_score ?? 0}</strong>
                </div>
              ))}
            </div>
          )}
          <nav className="glass bottom-nav">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                <t.icon size={18} />{t.label}
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
