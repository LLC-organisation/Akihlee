'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Supabase never reveals whether the email exists (avoids leaking
      // registered accounts), so a request error here is a real failure
      // (bad request, rate limit), not "no such account".
      if (resetError) {
        setError(
          resetError.message.toLowerCase().includes('rate limit')
            ? 'Too many reset requests right now — please wait a few minutes and try again.'
            : 'Something went wrong. Please try again.'
        );
        return;
      }
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="relative min-h-screen bg-white dark:bg-canvas">
        <div className="bg-glow" />
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-8 text-center">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Check your email</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              If an account exists for <span className="font-medium text-slate-700 dark:text-slate-300">{email}</span>,
              we sent a link to reset your password. It expires in about an hour.
            </p>
            <Link
              href="/login"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors duration-200"
            >
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Reset your password</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Enter your email and we&apos;ll send you a link to set a new password.
          </p>

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
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas px-3 py-2.5 text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 transition-colors duration-200"
                placeholder="you@business.com"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
            >
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400 text-center">
            Remembered it?{' '}
            <Link href="/login" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors duration-200">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
