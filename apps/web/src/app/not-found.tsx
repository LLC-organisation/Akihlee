'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAuthToken } from '@/lib/api-client';

const primaryButtonClasses =
  'inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-5 py-2.5 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200';
const cardClasses =
  'bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none';

// A short pause before the automatic redirect, long enough to read where
// you're being sent — an instant redirect would just look like the click
// did nothing.
const REDIRECT_DELAY_MS = 2000;

export default function NotFound() {
  const router = useRouter();
  const [destination, setDestination] = useState<'/dashboard' | '/'>('/');

  useEffect(() => {
    const target = getAuthToken() ? '/dashboard' : '/';
    setDestination(target);
    const timer = setTimeout(() => router.replace(target), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [router]);

  const destinationLabel = destination === '/dashboard' ? 'Dashboard' : 'Homepage';

  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8">
        <main className={`${cardClasses} max-w-md w-full text-center p-10`}>
          <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent text-white font-bold text-xl mx-auto mb-6">
            A
          </span>

          <p className="text-6xl font-bold text-slate-900 dark:text-white mb-2">404</p>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Page not found</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
            The page you&apos;re looking for doesn&apos;t exist or may have moved. We&apos;ll take you to your{' '}
            {destinationLabel.toLowerCase()} in a moment.
          </p>

          <Link href={destination} className={primaryButtonClasses}>
            Go to {destinationLabel}
          </Link>
        </main>
      </div>
    </div>
  );
}
