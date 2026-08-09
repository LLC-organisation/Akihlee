'use client';

import { useEffect, useState } from 'react';
import { getStoredTheme, setTheme, Theme } from '@/lib/theme';

export function ThemeToggle({ iconOnly = false }: { iconOnly?: boolean }) {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };

  const label = theme === 'dark' ? 'Light mode' : 'Dark mode';
  const icon =
    theme === 'dark' ? (
      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ) : (
      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    );

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="group relative flex items-center justify-center w-11 h-11 mx-auto rounded-xl text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-400 transition-colors duration-200"
      >
        {icon}
        <span className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 dark:bg-white px-2.5 py-1.5 text-xs font-medium text-white dark:text-canvas opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-30">
          {label}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-400 transition-colors duration-200"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
