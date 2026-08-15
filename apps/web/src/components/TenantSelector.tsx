'use client';

import { useEffect, useRef, useState } from 'react';
import { adminTenantsApi, AdminTenantSummary } from '@/lib/api-client';

const inputClasses =
  'w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-canvas px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-accent transition-colors duration-200';

/**
 * Search-by-name-or-id tenant picker for admin tooling — an admin
 * troubleshooting a specific business shouldn't need its UUID memorized.
 * Selecting a result reports {id, businessName} up; clearing the text
 * input (or the "x") reports null so callers can drop the filter.
 */
export function TenantSelector({
  value,
  onChange,
}: {
  value: AdminTenantSummary | null;
  onChange: (tenant: AdminTenantSummary | null) => void;
}) {
  const [query, setQuery] = useState(value?.businessName ?? '');
  const [results, setResults] = useState<AdminTenantSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in sync when a selection is made/cleared
  // elsewhere (e.g. "Clear filters").
  useEffect(() => {
    setQuery(value?.businessName ?? '');
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      setLoading(true);
      adminTenantsApi
        .search(query.trim())
        .then((page) => setResults(page.content))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onChange(null);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search tenant name or id…"
          className={`${inputClasses} pr-7`}
        />
        {value && (
          <button
            type="button"
            aria-label="Clear tenant"
            onClick={() => {
              onChange(null);
              setQuery('');
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-200"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-surface shadow-lg">
          {loading && <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">Searching…</p>}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">No tenants match.</p>
          )}
          {!loading &&
            results.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                onClick={() => {
                  onChange(tenant);
                  setQuery(tenant.businessName);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-white/5 transition-colors duration-200"
              >
                <span className="block truncate">{tenant.businessName}</span>
                <span className="block truncate text-xs text-slate-400 dark:text-slate-500">{tenant.id}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
