'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi, setAuthToken } from '@/lib/api-client';
import { isAxiosError } from 'axios';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const auth = await authApi.login(email, password);
      setAuthToken(auth.token);
      router.push('/dashboard');
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 401) {
        setError('Invalid email or password.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900 p-4">
      <div className="w-full max-w-md bg-slate-50 dark:bg-slate-800 rounded-lg border border-primary-100 dark:border-slate-700 p-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Welcome back</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Log in to your Akihlee dashboard</p>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm px-4 py-3"
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
              className="w-full rounded-md border border-primary-200 dark:border-slate-600 px-3 py-2 text-slate-900 dark:text-white dark:bg-slate-900 focus:border-primary-500"
              placeholder="you@business.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-primary-200 dark:border-slate-600 px-3 py-2 text-slate-900 dark:text-white dark:bg-slate-900 focus:border-primary-500"
              placeholder="Your password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white font-medium rounded-md py-2.5 transition-colors"
          >
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-600 dark:text-slate-400 text-center">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
