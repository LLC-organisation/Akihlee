'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearAuthToken, getCurrentUserRole } from '@/lib/api-client';
import { ThemeToggle } from './ThemeToggle';

// /public/logo-icon.png is a cropped, icon-only version of the full
// logo.png lockup (which has the "Akihlee" wordmark baked into the image) —
// this component pairs it with a separate text label, so using the full
// lockup here would duplicate the name. Falls back to a plain mark so the
// sidebar never shows a broken image if the file goes missing.
function Logo() {
  const [imgFailed, setImgFailed] = useState(false);
  if (imgFailed) {
    return (
      <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent text-white font-bold text-sm shrink-0">
        A
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-icon.png"
      alt="Akihlee"
      className="w-9 h-9 rounded-xl object-contain shrink-0"
      onError={() => setImgFailed(true)}
    />
  );
}

// Label shown beside a rail item's icon once the sidebar is hovered and
// widens — `group-hover/sidebar` targets the named group on <aside> (see
// below), which is what's actually being hovered, not this item itself.
// Present in the DOM (just visually faded at opacity-0) rather than
// tooltip-style, so screen readers always get the name regardless of
// hover state. Collapsed to max-w-0 (not just opacity-0) so it takes no
// layout width while the rail is narrow — an invisible-but-present label
// was pulling `justify-center` off-balance and shoving the icon toward
// the left edge of the collapsed rail, rather than the icon sitting
// centered alone.
function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block max-w-0 overflow-hidden whitespace-nowrap opacity-0 group-hover/sidebar:max-w-[160px] group-hover/sidebar:opacity-100 transition-all duration-200">
      {children}
    </span>
  );
}

// "as const" keeps each href a literal type (e.g. "/dashboard") rather than
// widened to plain string — required for next/link's href prop to satisfy
// the typedRoutes experiment enabled in next.config, which next dev doesn't
// check but next build does.
const NAV_LINKS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: '/documents',
    label: 'Documents',
    // Only nav entry with a child dynamic route (/documents/[id]) — needs a
    // prefix match to stay highlighted there, unlike every other entry.
    matchPrefix: true,
    // Stacked-sheets glyph (Heroicons "document-duplicate") — distinct from
    // Extracted Data's single ruled-page glyph below.
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
      </svg>
    ),
  },
  {
    href: '/extracted-data',
    label: 'Extracted Data',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 3.75a7.5 7.5 0 017.5 7.5h-7.5v-7.5z" />
      </svg>
    ),
  },
  {
    href: '/ai-cfo',
    label: 'AI CFO',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    href: '/integrations',
    label: 'Integrations',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
] as const;

const ADMIN_LINKS = [
  {
    href: '/admin/users',
    label: 'Users',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 4a4 4 0 00-3-3.87M9 12a4 4 0 10-4-4" />
      </svg>
    ),
    matchPrefix: true,
  },
  {
    href: '/admin/audit-log',
    label: 'Audit Log',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
] as const;

// `rail` items center their icon while the sidebar sits collapsed to icon
// width, then fall back to left-aligned (icon, gap, label) once
// `group-hover/sidebar` widens it — otherwise the icon sits under the
// left padding alone and reads as pushed off-center in the narrow rail.
function navLinkClasses(active: boolean, rail = false): string {
  return `flex items-center px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 ${
    rail ? 'justify-center gap-0 group-hover/sidebar:justify-start group-hover/sidebar:gap-3' : 'gap-3'
  } ${
    active
      ? 'bg-slate-900 text-white dark:bg-white dark:text-canvas'
      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
  }`;
}

// No baked-in gap — callers add `gap-3` (mobile) or the rail's
// centered/expanding pair (see navLinkClasses) themselves, since a fixed
// gap next to a zero-width collapsed RailLabel still reserves its own
// space and throws off `justify-center`.
const siteLinkClasses =
  'flex items-center px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors duration-200';

const logoutLinkClasses =
  'flex items-center px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-200';

const railGapJustifyClasses = 'justify-center gap-0 group-hover/sidebar:justify-start group-hover/sidebar:gap-3';

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(getCurrentUserRole() === 'ADMIN');
  }, []);

  const handleLogout = () => {
    clearAuthToken();
    router.push('/login');
  };

  // `rail` renders the desktop sidebar, which sits collapsed to icon width
  // until the whole <aside> is hovered (see `group/sidebar` there) and
  // widens to reveal each label — as opposed to the mobile slide-down menu,
  // which is never collapsed and just shows the icon+text row directly.
  const navItems = (onNavigate?: () => void, rail = false) => (
    <>
      {NAV_LINKS.map((link) => {
        const active = 'matchPrefix' in link && link.matchPrefix
          ? pathname === link.href || pathname.startsWith(`${link.href}/`)
          : pathname === link.href;
        return (
          <Link key={link.href} href={link.href} onClick={onNavigate} className={navLinkClasses(active, rail)}>
            <span className="shrink-0">{link.icon}</span>
            {rail ? <RailLabel>{link.label}</RailLabel> : link.label}
          </Link>
        );
      })}
      {isAdmin &&
        ADMIN_LINKS.map((link) => {
          const active = 'matchPrefix' in link && link.matchPrefix
            ? pathname === link.href || pathname.startsWith(`${link.href}/`)
            : pathname === link.href;
          return (
            <Link key={link.href} href={link.href} onClick={onNavigate} className={navLinkClasses(active, rail)}>
              <span className="shrink-0">{link.icon}</span>
              {rail ? <RailLabel>{link.label}</RailLabel> : link.label}
            </Link>
          );
        })}
    </>
  );

  return (
    <>
      {/* Desktop sidebar — collapsed to an icon rail to keep the content
          area wide; hovering the whole thing (`group/sidebar`) widens it
          and reveals every label. `overflow-hidden` is what makes that a
          reveal instead of a reflow: labels are always in the DOM at full
          width, just clipped at the collapsed 80px until the sidebar's
          own width grows past them. It overlays page content while
          expanded (fixed position, higher z-index) rather than pushing it,
          so nothing else on the page needs to react to the hover. */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-20 hover:w-64 group/sidebar overflow-hidden transition-[width] duration-200 ease-in-out bg-white dark:bg-surface border-r border-slate-200 dark:border-white/10 px-3 py-6 z-20">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-2 mb-8 shrink-0" aria-label="Akihlee — Dashboard">
          <Logo />
          <span className="text-lg font-bold text-slate-900 dark:text-white whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
            Akihlee
          </span>
        </Link>

        <nav className="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          {navItems(undefined, true)}
        </nav>

        <div className="flex flex-col gap-1 pt-4 mt-4 border-t border-slate-200 dark:border-white/10 shrink-0">
          <a
            href="https://www.akihlee.com"
            target="_blank"
            rel="noopener noreferrer"
            className={`${siteLinkClasses} ${railGapJustifyClasses}`}
          >
            <span className="shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </span>
            <RailLabel>Our Landing Page</RailLabel>
          </a>
          <ThemeToggle rail />
          <button onClick={handleLogout} className={`${logoutLinkClasses} ${railGapJustifyClasses}`}>
            <span className="shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </span>
            <RailLabel>Log out</RailLabel>
          </button>
        </div>
      </aside>

      {/* Mobile top bar + slide-down menu */}
      <header className="lg:hidden sticky top-0 z-20 bg-white/80 dark:bg-canvas/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between h-16 px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Logo />
            <span className="text-lg font-bold text-slate-900 dark:text-white">Akihlee</span>
          </Link>
          <button
            type="button"
            className="p-2 -mr-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
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

        {menuOpen && (
          <nav className="px-4 pb-4 flex flex-col gap-1">
            {navItems(() => setMenuOpen(false))}
            <a href="https://www.akihlee.com" target="_blank" rel="noopener noreferrer" className={`${siteLinkClasses} gap-3`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              akihlee.com
            </a>
            <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-200 dark:border-white/10">
              <ThemeToggle />
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 px-3 py-2 transition-colors duration-200"
              >
                Log out
              </button>
            </div>
          </nav>
        )}
      </header>
    </>
  );
}
