'use client';

import { useCallback, useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, tenantApi, Tenant } from '@/lib/api-client';
import { AppSidebar } from '@/components/AppSidebar';
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
const primaryButtonClasses =
  'inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-4 py-2.5 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none';
const successBanner =
  'mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm px-4 py-3';
const errorBanner =
  'mb-4 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm px-4 py-3';

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
      title="WhatsApp"
      description="Connect a WhatsApp number so you can send receipts and invoices directly to Akihlee."
    >
      {message && <div className={message.type === 'success' ? successBanner : errorBanner}>{message.text}</div>}

      {tenant.whatsappPhoneNumber ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Connected: <span className="font-medium text-slate-900 dark:text-white">+{tenant.whatsappPhoneNumber}</span>
          </p>
          <button
            onClick={handleDisconnect}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-200"
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

function EmailSection({ tenant }: { tenant: Tenant }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tenant.inboundEmailAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the
      // address is still selectable/visible, so this is non-critical.
    }
  };

  return (
    <SectionCard
      title="Email"
      description="Forward or CC receipts and invoices to this address — attachments are picked up automatically."
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <code className="flex-1 px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-canvas border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white break-all">
          {tenant.inboundEmailAddress}
        </code>
        <button
          onClick={handleCopy}
          className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-white/10 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 whitespace-nowrap transition-colors duration-200"
        >
          {copied ? 'Copied!' : 'Copy address'}
        </button>
      </div>
    </SectionCard>
  );
}

function SquareSection() {
  return (
    <SectionCard title="Square" description="Sync transactions from your Square POS automatically.">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">Coming soon.</p>
        <button
          disabled
          className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 cursor-not-allowed"
        >
          Connect Square
        </button>
      </div>
    </SectionCard>
  );
}

export default function IntegrationsPage() {
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Integrations</h1>

          {loading && <p className="text-slate-500 dark:text-slate-400">Loading…</p>}

          {!loading && error && (
            <div className="text-center py-12">
              <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
              <button onClick={load} className={primaryButtonClasses}>Retry</button>
            </div>
          )}

          {!loading && !error && tenant && (
            <div className="space-y-6">
              <EmailSection tenant={tenant} />
              <WhatsAppSection tenant={tenant} onUpdated={setTenant} />
              <SquareSection />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
