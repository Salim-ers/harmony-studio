/**
 * Barrière d'accès et CSP à nonce pour toutes les pages de l'application.
 * - Pages privées : redirection vers la connexion si aucun cookie de session n'est présent
 *   (la VRAIE vérification — session en base, expiration, révocation — est faite côté serveur
 *   dans chaque page et chaque route API).
 * - /apercu : non concerné (jeton signé + CSP sandbox propre).
 */
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/', '/api/auth/login', '/api/health', '/api/cron'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== 'production';
  const previewOrigin = (process.env.PREVIEW_ORIGIN ?? '').replace(/\/$/, '');
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    `frame-src 'self'${previewOrigin ? ` ${previewOrigin}` : ''}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  const isApi = pathname.startsWith('/api/');
  const hasCookie = request.cookies.has('__Host-harmony_session') || request.cookies.has('harmony_session');
  if (!isApi && !PUBLIC.includes(pathname) && !hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = pathname !== '/' ? `?suite=${encodeURIComponent(pathname)}` : '';
    return NextResponse.redirect(url);
  }
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  if (!isApi) response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [{ source: '/((?!_next/static|_next/image|favicon|apercu/).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }] }],
};
