'use client';

import { useCallback, useEffect, useState, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAuthToken, tenantApi, integrationsApi, Tenant } from '@/lib/api-client';
import { AppSidebar } from '@/components/AppSidebar';
import { isAxiosError } from 'axios';

function SectionCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-6 sm:p-8 transition-all duration-200">
      <div className="flex items-center gap-3">
        {icon}
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      </div>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">{description}</p>}
      <div className={description ? '' : 'mt-4'}>{children}</div>
    </div>
  );
}

// Custom-drawn glyphs (not literal brand asset files) rendered in each
// integration's characteristic color — matches the app's existing
// stroke-icon-in-a-tinted-badge convention (see dashboard StatTile, the
// landing page's feature cards) rather than pulling in a third-party icon
// pack or an external logo image.
function EmailLogo() {
  return (
    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
        />
      </svg>
    </span>
  );
}

function WhatsAppLogo() {
  return (
    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.362-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
        />
      </svg>
    </span>
  );
}

function SquareLogo() {
  return (
    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 dark:bg-white shrink-0">
      <span className="w-4 h-4 rounded-md border-2 border-white dark:border-slate-900" />
    </span>
  );
}

function QuickBooksLogo() {
  return (
    <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v12m-4-9.5c0 1.38 1.79 2.5 4 2.5s4 1.12 4 2.5-1.79 2.5-4 2.5-4-1.12-4-2.5"
        />
      </svg>
    </span>
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
      icon={<WhatsAppLogo />}
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
      icon={<EmailLogo />}
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

function SquareSection({
  tenant,
  onUpdated,
  oauthBanner,
}: {
  tenant: Tenant;
  onUpdated: (t: Tenant) => void;
  oauthBanner: { type: 'success' | 'error'; text: string } | null;
}) {
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleConnect = async () => {
    setMessage(null);
    setConnecting(true);
    try {
      const url = await integrationsApi.getSquareAuthorizeUrl();
      // A real top-level navigation, not a fetch — Square's own consent
      // screen isn't something an XHR can render.
      window.location.href = url;
    } catch (err) {
      const notConfigured = isAxiosError(err) && err.response?.status === 400;
      setMessage({
        type: 'error',
        text: notConfigured
          ? (err.response?.data as { error?: string } | undefined)?.error ?? 'Square OAuth is not configured.'
          : 'Could not start connecting to Square. Please try again.',
      });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setMessage(null);
    setDisconnecting(true);
    try {
      await integrationsApi.disconnectSquare();
      onUpdated({ ...tenant, squareConnected: false });
      setMessage({ type: 'success', text: 'Square disconnected.' });
    } catch {
      setMessage({ type: 'error', text: 'Could not disconnect. Please try again.' });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSync = async () => {
    setMessage(null);
    setSyncing(true);
    try {
      const result = await integrationsApi.syncSquare();
      setMessage({
        type: 'success',
        text: result.imported === 0
          ? 'Synced — no new transactions in the last 30 days.'
          : `Synced ${result.imported} new transaction${result.imported === 1 ? '' : 's'} from Square. Check Documents to review them.`,
      });
    } catch (err) {
      const notConfigured = isAxiosError(err) && err.response?.status === 400;
      setMessage({
        type: 'error',
        text: notConfigured
          ? (err.response?.data as { error?: string } | undefined)?.error ?? 'Square is not configured.'
          : 'Could not sync with Square. Please try again.',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <SectionCard
      title="Square"
      icon={<SquareLogo />}
      description={
        tenant.squareConnected
          ? 'Sync payments from your Square POS into Documents for review.'
          : 'Connect your Square account so your payments show up in Documents for review — no API keys needed.'
      }
    >
      {oauthBanner && <div className={oauthBanner.type === 'success' ? successBanner : errorBanner}>{oauthBanner.text}</div>}
      {message && <div className={message.type === 'success' ? successBanner : errorBanner}>{message.text}</div>}

      {tenant.squareConnected ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Pulls the last 30 days of payments each time.</p>
          <div className="flex items-center gap-3">
            <button onClick={handleSync} disabled={syncing} className={primaryButtonClasses}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-200 disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button onClick={handleConnect} disabled={connecting} className={primaryButtonClasses}>
            {connecting ? 'Redirecting…' : 'Connect with Square'}
          </button>
        </div>
      )}
    </SectionCard>
  );
}

function QuickBooksSection({
  tenant,
  onUpdated,
  oauthBanner,
}: {
  tenant: Tenant;
  onUpdated: (t: Tenant) => void;
  oauthBanner: { type: 'success' | 'error'; text: string } | null;
}) {
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleConnect = async () => {
    setMessage(null);
    setConnecting(true);
    try {
      const url = await integrationsApi.getQuickBooksAuthorizeUrl();
      // A real top-level navigation, not a fetch — Intuit's own consent
      // screen isn't something an XHR can render.
      window.location.href = url;
    } catch (err) {
      const notConfigured = isAxiosError(err) && err.response?.status === 400;
      setMessage({
        type: 'error',
        text: notConfigured
          ? (err.response?.data as { error?: string } | undefined)?.error ?? 'QuickBooks OAuth is not configured.'
          : 'Could not start connecting to QuickBooks. Please try again.',
      });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setMessage(null);
    setDisconnecting(true);
    try {
      await integrationsApi.disconnectQuickBooks();
      onUpdated({ ...tenant, quickbooksConnected: false });
      setMessage({ type: 'success', text: 'QuickBooks disconnected.' });
    } catch {
      setMessage({ type: 'error', text: 'Could not disconnect. Please try again.' });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSync = async () => {
    setMessage(null);
    setSyncing(true);
    try {
      const result = await integrationsApi.syncQuickBooks();
      setMessage({
        type: 'success',
        text: result.imported === 0
          ? 'Synced — no new transactions in the last 30 days.'
          : `Synced ${result.imported} new transaction${result.imported === 1 ? '' : 's'} from QuickBooks. Check Documents to review them.`,
      });
    } catch (err) {
      const notConfigured = isAxiosError(err) && err.response?.status === 400;
      setMessage({
        type: 'error',
        text: notConfigured
          ? (err.response?.data as { error?: string } | undefined)?.error ?? 'QuickBooks is not configured.'
          : 'Could not sync with QuickBooks. Please try again.',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <SectionCard
      title="QuickBooks"
      icon={<QuickBooksLogo />}
      description={
        tenant.quickbooksConnected
          ? 'Sync expenses from QuickBooks into Documents for review.'
          : 'Connect your QuickBooks company so your expenses show up in Documents for review — no API keys needed.'
      }
    >
      {oauthBanner && <div className={oauthBanner.type === 'success' ? successBanner : errorBanner}>{oauthBanner.text}</div>}
      {message && <div className={message.type === 'success' ? successBanner : errorBanner}>{message.text}</div>}

      {tenant.quickbooksConnected ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Pulls the last 30 days of expenses each time.</p>
          <div className="flex items-center gap-3">
            <button onClick={handleSync} disabled={syncing} className={primaryButtonClasses}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-200 disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button onClick={handleConnect} disabled={connecting} className={primaryButtonClasses}>
            {connecting ? 'Redirecting…' : 'Connect with QuickBooks'}
          </button>
        </div>
      )}
    </SectionCard>
  );
}

/**
 * Surfaces the ?<paramName>=connected|error banner an OAuth callback
 * redirect leaves on the URL (see SquareIntegrationController/
 * QuickBooksIntegrationController's redirectToIntegrations), then strips
 * the param so a refresh doesn't keep re-showing a stale banner.
 */
function useOAuthBanner(
  paramName: string,
  connectedText: string,
  errorText: string
): { type: 'success' | 'error'; text: string } | null {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const value = searchParams.get(paramName);
    if (!value) return;
    setBanner(
      value === 'connected' ? { type: 'success', text: connectedText } : { type: 'error', text: errorText }
    );
    router.replace('/integrations');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return banner;
}

// useSearchParams() (read below, for the Square/QuickBooks OAuth
// callbacks' ?square=connected|error / ?quickbooks=connected|error) opts
// the page into client-side rendering and requires a Suspense boundary
// around anything that calls it, or `next build` fails prerendering this
// route — see the default export below.
function IntegrationsPageContent() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const squareOAuthBanner = useOAuthBanner(
    'square', 'Square connected.', 'Could not connect to Square. Please try again.'
  );
  const quickbooksOAuthBanner = useOAuthBanner(
    'quickbooks', 'QuickBooks connected.', 'Could not connect to QuickBooks. Please try again.'
  );

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
      <div className="relative z-10 lg:pl-20">
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
              <SquareSection tenant={tenant} onUpdated={setTenant} oauthBanner={squareOAuthBanner} />
              <QuickBooksSection tenant={tenant} onUpdated={setTenant} oauthBanner={quickbooksOAuthBanner} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={null}>
      <IntegrationsPageContent />
    </Suspense>
  );
}
