'use client';

import { useCallback, useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, tenantApi, authApi, Tenant } from '@/lib/api-client';
import { AppSidebar } from '@/components/AppSidebar';
import { getStoredTheme, setTheme, Theme } from '@/lib/theme';
import { isAxiosError } from 'axios';

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-6 sm:p-8 transition-all duration-200">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">{description}</p>}
      <div className={description ? '' : 'mt-4'}>{children}</div>
    </div>
  );
}

const inputClasses =
  'w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas px-3 py-2.5 text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 transition-colors duration-200';
const labelClasses = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';
const primaryButtonClasses =
  'inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none';
const successBanner =
  'mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm px-4 py-3';
const errorBanner =
  'mb-4 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm px-4 py-3';

function AppearanceSection() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    setThemeState(next);
  };

  return (
    <SectionCard title="Appearance" description="Choose how Akihlee looks on this device.">
      <div className="flex gap-3">
        {(['light', 'dark'] as const).map((option) => (
          <button
            key={option}
            onClick={() => choose(option)}
            className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium capitalize transition-all duration-200 ${
              theme === option
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-400'
            }`}
          >
            {option} mode
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

function ProfileSection({ tenant, onUpdated }: { tenant: Tenant; onUpdated: (t: Tenant) => void }) {
  const [businessName, setBusinessName] = useState(tenant.businessName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const updated = await tenantApi.updateBusinessName(businessName);
      onUpdated(updated);
      setMessage({ type: 'success', text: 'Business name updated.' });
    } catch {
      setMessage({ type: 'error', text: 'Could not update business name. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Business Profile">
      {message && <div className={message.type === 'success' ? successBanner : errorBanner}>{message.text}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="businessName" className={labelClasses}>Business name</label>
          <input
            id="businessName"
            type="text"
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className={inputClasses}
          />
        </div>
        <button type="submit" disabled={saving} className={primaryButtonClasses}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </SectionCard>
  );
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setSaving(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setMessage({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 400) {
        setMessage({ type: 'error', text: 'Current password is incorrect.' });
      } else {
        setMessage({ type: 'error', text: 'Could not change password. Please try again.' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Change Password">
      {message && <div className={message.type === 'success' ? successBanner : errorBanner}>{message.text}</div>}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="currentPassword" className={labelClasses}>Current password</label>
          <input
            id="currentPassword"
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="newPassword" className={labelClasses}>New password</label>
          <input
            id="newPassword"
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="confirmNewPassword" className={labelClasses}>Confirm new password</label>
          <input
            id="confirmNewPassword"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClasses}
          />
        </div>
        <button type="submit" disabled={saving} className={primaryButtonClasses}>
          {saving ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </SectionCard>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login');
      return;
    }
    setCheckedAuth(true);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTenant(await tenantApi.get());
    } catch {
      setError('Could not load your account. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth) load();
  }, [checkedAuth, load]);

  if (!checkedAuth) return null;

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <AppSidebar />
      <div className="relative z-10 lg:pl-64">
        <main className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Settings</h1>

          {loading && <p className="text-slate-500 dark:text-slate-400">Loading…</p>}

          {!loading && error && (
            <div className="text-center py-12">
              <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
              <button onClick={load} className={primaryButtonClasses}>Retry</button>
            </div>
          )}

          {!loading && !error && tenant && (
            <div className="space-y-6">
              <AppearanceSection />
              <ProfileSection tenant={tenant} onUpdated={setTenant} />
              <ChangePasswordSection />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
