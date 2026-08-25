import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow public static assets and files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/docs/') ||
    pathname.startsWith('/fonts/') ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf|woff|woff2|pdf|docx|xlsx)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 2. Allow public auth routes
  if (
    pathname === '/login' ||
    pathname === '/register' ||
    pathname.startsWith('/api/auth/')
  ) {
    return NextResponse.next();
  }

  // 3. Allow cron endpoints with secret header
  if (pathname.startsWith('/api/cron/')) {
    return NextResponse.next();
  }

  // 4. Check for session cookie, authorization header, or api key
  const sessionCookie = request.cookies.get('tender_session_id')?.value;
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  const apiKeyHeader = request.headers.get('x-api-key') || request.headers.get('X-Api-Key');
  const cronSecretHeader = request.headers.get('x-cron-secret') || request.headers.get('X-Cron-Secret');

  const hasAuth = !!(sessionCookie || authHeader || apiKeyHeader || cronSecretHeader);

  // 5. Handle unauthenticated requests
  if (!hasAuth) {
    // For API requests, return HTTP 401 Unauthorized JSON
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Требуется вход в систему' },
        { status: 401 }
      );
    }

    // For page navigations, redirect to /login
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 6. Pass session ID in request headers to downstream handlers
  const requestHeaders = new Headers(request.headers);
  if (sessionCookie) {
    requestHeaders.set('x-session-id', sessionCookie);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files, _next internal routes, and favicon
     */
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ]
};
