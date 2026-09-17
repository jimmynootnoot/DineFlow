import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey =
  process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabaseConfigError = !supabaseUrl || !supabaseKey
  ? 'Supabase is not configured. Add REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the app.'
  : null;

// Placeholder values keep the app buildable before local environment variables
// are configured. Auth methods surface supabaseConfigError instead of using it.
export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseKey || 'supabase-not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

