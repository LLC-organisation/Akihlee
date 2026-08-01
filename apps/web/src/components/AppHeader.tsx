'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearAuthToken } from '@/lib/api-client';
import { ThemeToggle } from './ThemeToggle';

// Renders /public/logo.png once it exists; falls back to a plain mark so the
// header never shows a broken image in the meantime.
function Logo() {
  const [imgFailed, setImgFailed] = useState(false);
  if (imgFailed) {
    return (
      <span className="flex items-center justify-center w-8 h-8 rounded-md bg-primary-600 text-white font-bold text-sm">
        A
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Akihlee"
      className="w-8 h-8 rounded-md object-contain"
      onError={() => setImgFailed(true)}
    />
  );
}

// "as const" keeps each href a literal type (e.g. "/dashboard") rather than
// widened to plain string — required for next/link's href prop to satisfy
// the typedRoutes experiment enabled in next.config, which next dev doesn't
// check but next build does.
const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/extracted-data', label: 'Extracted Data' },
  { href: '/ai-cfo', label: 'AI CFO' },
  { href: '/settings', label: 'Settings' },
] as const;

function navLinkClasses(active: boolean): string {
  return `px-3 py-2 rounded-md text-sm font-medium ${
    active
      ? 'bg-primary-50 dark:bg-slate-800 text-primary-700 dark:text-primary-300'
      : 'text-slate-600 dark:text-slate-300 hover:text-primary-700 dark:hover:text-primary-300 hover:bg-primary-50 dark:hover:bg-slate-800'
  }`;
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    clearAuthToken();
    router.push('/login');
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-primary-100 dark:border-slate-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <Logo />
            <span className="text-lg font-bold text-slate-900 dark:text-white">Akihlee</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={navLinkClasses(pathname === link.href)}>
                {link.label}
              </Link>
            ))}
            <a
              href="https://www.akihlee.com"
              target="_blank"
              rel="noopener noreferrer"
              className={navLinkClasses(false)}
            >
              akihlee.com
            </a>
          </nav>

          <div className="hidden lg:flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 px-3 py-2"
            >
              Log out
            </button>
          </div>

          {/* Mobile hamburger toggle */}
          <button
            type="button"
            className="lg:hidden p-2 -mr-2 text-slate-600 dark:text-slate-300 hover:text-primary-700 dark:hover:text-primary-300"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu panel */}
        {menuOpen && (
          <nav className="lg:hidden pb-4 flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={navLinkClasses(pathname === link.href)}
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://www.akihlee.com"
              target="_blank"
              rel="noopener noreferrer"
              className={navLinkClasses(false)}
            >
              akihlee.com
            </a>
            <div className="pt-2 mt-2 border-t border-primary-100 dark:border-slate-700 flex items-center justify-between">
              <ThemeToggle />
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-primary-600 dark:text-primary-400 px-3 py-2"
              >
                Log out
              </button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
