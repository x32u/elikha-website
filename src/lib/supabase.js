import { createClient } from '@supabase/supabase-js';

const configuredSupabaseUrl = process.env.REACT_APP_SUPABASE_URL?.trim();
const configuredSupabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(
  configuredSupabaseUrl && configuredSupabaseAnonKey
);

// Keep imports from crashing when a developer has not created a local env file.
// App.js uses `isSupabaseConfigured` to show an actionable setup message before
// any request can reach this inert fallback client.
const supabaseUrl = configuredSupabaseUrl || 'http://127.0.0.1:54321';
const supabaseAnonKey = configuredSupabaseAnonKey || 'missing-anon-key';
// Match Supabase's existing default so existing logins remain valid.
export const AUTH_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});
