import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';
const API_ORIGIN = new URL(API_BASE_URL).origin;
const isDev = process.env.NODE_ENV !== 'production';

// Next dev's HMR/React Refresh runtime relies on eval-based source maps —
// only relaxed here in development, never in a deployed build.
const SCRIPT_SRC = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src ${SCRIPT_SRC}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${API_ORIGIN}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// Set here rather than next.config.js's headers(), which never actually
// reached the response — Next.js overrides Cache-Control from next.config
// on statically-optimized pages (documented behavior, not a bug).
//
// Note this Cache-Control still loses to Next's own value on statically-
// rendered routes (e.g. /dashboard) for the same reason, even set from
// middleware — Next stamps its s-maxage/stale-while-revalidate value onto
// cached page output after middleware runs. That's acceptable here: every
// page in this app is a client-rendered shell with no per-user data baked
// into the HTML (auth state lives in localStorage, financial data loads
// via authenticated fetch calls after mount), so what Next caches is safe
// to cache. The header below still applies as intended to every JSON
// response and Server-rendered/dynamic route, which is where any actual
// sensitive payload would appear; core-api's API responses separately
// enforce their own no-store via Spring Security (see SecurityConfig).
export function middleware(_request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  response.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets Next.js serves under /_next/static — headers on
    // long-lived, hashed, non-sensitive bundle files don't matter, and
    // no-store would just defeat their caching for no benefit.
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
