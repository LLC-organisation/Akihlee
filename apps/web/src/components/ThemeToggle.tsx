'use client';

import { useEffect, useState } from 'react';
import { getStoredTheme, setTheme, Theme } from '@/lib/theme';

export function ThemeToggle({ rail = false }: { rail?: boolean }) {
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

  if (rail) {
    // No local hover state needed — `group-hover/sidebar` reaches up to
    // AppSidebar's <aside>, which is the actual thing being hovered to
    // expand the rail. This works across the component boundary because
    // it's a plain CSS descendant selector under the hood, not something
    // that needs the hover state passed down as a prop.
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="flex items-center justify-center gap-0 group-hover/sidebar:justify-start group-hover/sidebar:gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-400 transition-colors duration-200"
      >
        {icon}
        <span className="inline-block max-w-0 overflow-hidden whitespace-nowrap opacity-0 group-hover/sidebar:max-w-[160px] group-hover/sidebar:opacity-100 transition-all duration-200">
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
