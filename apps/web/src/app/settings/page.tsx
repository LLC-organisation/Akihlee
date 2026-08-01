'use client';

import { useCallback, useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, tenantApi, authApi, Tenant } from '@/lib/api-client';
import { AppHeader } from '@/components/AppHeader';
import { getStoredTheme, setTheme, Theme } from '@/lib/theme';
import { isAxiosError } from 'axios';

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-lg border border-primary-100 dark:border-slate-700 p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      {description && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 mb-4">{description}</p>}
      <div className={description ? '' : 'mt-4'}>{children}</div>
    </div>
  );
}

const inputClasses =
  'w-full rounded-md border border-primary-200 dark:border-slate-600 px-3 py-2 text-slate-900 dark:text-white dark:bg-slate-900 focus:border-primary-500';
const labelClasses = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';
const primaryButtonClasses =
  'px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 dark:disabled:bg-primary-800 text-white text-sm font-medium rounded-md transition-colors';
const successBanner =
  'mb-4 rounded-md bg-primary-50 dark:bg-slate-900 border border-primary-200 dark:border-primary-700 text-primary-800 dark:text-primary-300 text-sm px-4 py-3';
const errorBanner =
  'mb-4 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm px-4 py-3';

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
            className={`flex-1 px-4 py-3 rounded-md border text-sm font-medium capitalize transition-colors ${
              theme === option
                ? 'border-primary-500 bg-primary-50 dark:bg-slate-900 text-primary-700 dark:text-primary-300'
                : 'border-primary-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-primary-50 dark:hover:bg-slate-700'
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

function WhatsAppSection({ tenant, onUpdated }: { tenant: Tenant; onUpdated: (t: Tenant) => void }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleConnect = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const updated = await tenantApi.connectWhatsApp(phoneNumber);
      onUpdated(updated);
      setPhoneNumber('');
      setMessage({ type: 'success', text: 'WhatsApp number connected.' });
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        setMessage({ type: 'error', text: 'That number is already connected to another account.' });
      } else {
        setMessage({ type: 'error', text: 'Enter a valid phone number with country code (e.g. +254712345678).' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setMessage(null);
    setSaving(true);
    try {
      const updated = await tenantApi.disconnectWhatsApp();
      onUpdated(updated);
      setMessage({ type: 'success', text: 'WhatsApp number disconnected.' });
    } catch {
      setMessage({ type: 'error', text: 'Could not disconnect. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="WhatsApp Integration"
      description="Connect a WhatsApp number so you can send receipts and invoices directly to Akihlee."
    >
      {message && <div className={message.type === 'success' ? successBanner : errorBanner}>{message.text}</div>}

      {tenant.whatsappPhoneNumber ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Connected: <span className="font-medium text-slate-900 dark:text-white">+{tenant.whatsappPhoneNumber}</span>
          </p>
          <button
            onClick={handleDisconnect}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-md border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950"
          >
            {saving ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleConnect} className="flex flex-col sm:flex-row gap-3">
          <input
            type="tel"
            required
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+254712345678"
            className={`${inputClasses} sm:flex-1`}
          />
          <button type="submit" disabled={saving} className={primaryButtonClasses}>
            {saving ? 'Connecting…' : 'Connect WhatsApp'}
          </button>
        </form>
      )}
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
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <AppHeader />

      <main className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Settings</h1>

        {loading && <p className="text-slate-500 dark:text-slate-400">Loading…</p>}

        {!loading && error && (
          <div className="text-center py-12">
            <p className="text-red-800 dark:text-red-300 mb-3">{error}</p>
            <button onClick={load} className={primaryButtonClasses}>Retry</button>
          </div>
        )}

        {!loading && !error && tenant && (
          <div className="space-y-6">
            <AppearanceSection />
            <ProfileSection tenant={tenant} onUpdated={setTenant} />
            <ChangePasswordSection />
            <WhatsAppSection tenant={tenant} onUpdated={setTenant} />
          </div>
        )}
      </main>
    </div>
  );
}
