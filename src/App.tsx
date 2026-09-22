import { lazy, Suspense, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { supabase } from './lib/supabase';

const Login = lazy(() => import('./pages/Login'));
const HomeApp = lazy(() => import('./pages/HomeApp'));

function Spin() {
  return (
    <div className="auth">
      <Loader2 className="spin" size={28} />
    </div>
  );
}

function Gate() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (active) setSession(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!ready) return <Spin />;
  if (!session?.user) return <Navigate to="/login" replace />;
  return (
    <Suspense fallback={<Spin />}>
      <HomeApp user={session.user} />
    </Suspense>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Spin />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Gate />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
