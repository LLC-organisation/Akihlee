'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, MeResponse } from './api-client';
import { supabase } from './supabase-client';

/**
 * Every protected page needs the same thing: redirect to /login if there's
 * no Supabase session, and (for role-gated nav/pages) know whether the
 * current user is an ADMIN. Centralizing it here replaces what used to be a
 * synchronous localStorage read (getAuthToken/getCurrentUserRole) repeated
 * per-page — Supabase's session is async, so every one of those call sites
 * had to change shape anyway; this is the one place that does it.
 *
 * `checkedAuth` mirrors the old per-page pattern (only render once we know
 * there's a session, to avoid a flash of protected content pre-redirect).
 */
export function useRequireAuth() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (!session) {
        router.replace('/login');
        return;
      }
      setCheckedAuth(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session) {
        setCheckedAuth(false);
        setMe(null);
        router.replace('/login');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!checkedAuth) return;
    let active = true;
    authApi.me().then((response) => {
      if (active) setMe(response);
    }).catch(() => {
      // Leave me null — pages that don't need role gating are unaffected;
      // role-gated UI (isAdmin) just fails closed.
    });
    return () => {
      active = false;
    };
  }, [checkedAuth]);

  return { checkedAuth, me, isAdmin: me?.role === 'ADMIN' };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
