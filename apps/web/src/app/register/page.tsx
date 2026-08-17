'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi, setAuthToken } from '@/lib/api-client';
import { isAxiosError } from 'axios';

export default function RegisterPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      const auth = await authApi.register(businessName, email, password);
      setAuthToken(auth.token);
      router.push('/dashboard');
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        setError('An account with that email already exists. Try logging in instead.');
      } else if (isAxiosError(err) && err.response?.status === 400) {
        setError('Please check your details and try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Create your account</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Set up your business on Akihlee</p>

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
              <label htmlFor="businessName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Business name
              </label>
              <input
                id="businessName"
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas px-3 py-2.5 text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 transition-colors duration-200"
                placeholder="Acme Kenya Ltd"
              />
            </div>

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

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Password
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
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas px-3 py-2.5 text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 transition-colors duration-200"
                placeholder="Re-enter your password"
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
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400 text-center">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors duration-200">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
