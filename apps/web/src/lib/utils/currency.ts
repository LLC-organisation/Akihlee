export type CurrencyCode = 'USD' | 'EUR' | 'GBP';

export const CURRENCIES: { code: CurrencyCode; symbol: string; label: string }[] = [
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
];

/**
 * Static, approximate conversion rates (relative to USD) for display
 * purposes only — not live market rates, and not wired to any FX provider.
 * All amounts stored by the app are treated as USD-equivalent (see the
 * Analytics page's mixed-currency caveat), so this only rescales what's
 * shown; it never changes what's aggregated on the backend.
 */
const APPROXIMATE_USD_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
};

export function convertFromUsd(amountUsd: number, currency: CurrencyCode): number {
  return amountUsd * APPROXIMATE_USD_RATES[currency];
}

export function formatCurrency(amountUsd: number, currency: CurrencyCode = 'USD'): string {
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? '$';
  const converted = convertFromUsd(amountUsd, currency);
  const sign = converted < 0 ? '-' : '';
  return `${sign}${symbol}${Math.abs(converted).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
