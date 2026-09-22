import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { supabase } from './lib/supabase';
import HomeApp from './pages/HomeApp';
import Login from './pages/Login';

function Gate() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
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
