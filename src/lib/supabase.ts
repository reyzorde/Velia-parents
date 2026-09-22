import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

if (!url || !key) {
  console.warn('[Velia Parents] .env: VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-key'
);

export const isConfigured = Boolean(url && key && !url.includes('placeholder'));
