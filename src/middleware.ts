import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Read existing session cookie or session header
  const existingCookie = request.cookies.get('tender_session_id')?.value;
  const existingHeader = request.headers.get('x-session-id');

  // Determine or generate unique session ID
  const sessionId = existingCookie || existingHeader || crypto.randomUUID();

  // Clone request headers to pass x-session-id to API routes in current request pipeline
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-session-id', sessionId);

  // Create response with updated request headers
  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  // Set httpOnly cookie if missing or to refresh persistence
  if (!existingCookie) {
    response.cookies.set({
      name: 'tender_session_id',
      value: sessionId,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/'
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files, _next internal routes, and favicon
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
};
