/**
 * Browser Supabase client — owns the login session (access/refresh tokens,
 * auto-refresh) that api-client.ts's axios interceptor reads from. This app
 * has no server-component/middleware auth, so the default localStorage-based
 * session persistence is enough; no need for @supabase/ssr's cookie dance.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
