'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Supabase's reset-password link redirects here with either a
    // session-bearing hash (valid link — the client parses it automatically
    // and fires PASSWORD_RECOVERY below) or an
    // #error=...&error_code=...&error_description=... hash (an expired or
    // already-used link) that it leaves untouched for the app to surface.
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const errorDescription = hashParams.get('error_description');
    if (errorDescription) {
      setLinkError(errorDescription.replace(/\+/g, ' '));
      setReady(true);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });

    // Covers a fast reload where the recovery session is already
    // established and onAuthStateChange won't fire again for it.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError('Could not update your password. Please request a new reset link and try again.');
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-8">
          {!ready ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Verifying your link…</p>
          ) : linkError ? (
            <div className="text-center">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Link expired</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{linkError}</p>
              <Link
                href="/forgot-password"
                className="inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200"
              >
                Request a new link
              </Link>
            </div>
          ) : success ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
              Password updated — taking you to your dashboard…
            </p>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Set a new password</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Choose a new password for your account.</p>

              {error && (
                <div
                  role="alert"
                  className="mb-4 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm px-4 py-3"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    New password
                  </label>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas px-3 py-2.5 text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 transition-colors duration-200"
                    placeholder="At least 8 characters"
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Confirm new password
                  </label>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas px-3 py-2.5 text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 transition-colors duration-200"
                    placeholder="Re-enter your new password"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 select-none">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 dark:border-white/20 text-blue-600 focus:ring-blue-500 dark:bg-canvas"
                  />
                  Show passwords
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {submitting ? 'Saving…' : 'Set new password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
