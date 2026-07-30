import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export interface AuthValidationResult {
  authorized: boolean;
  response?: NextResponse;
  userId: string;
  role: 'ADMIN' | 'USER';
}

/**
 * Validates request authorization token / API key and resolves current user ID (userId) for multi-tenancy.
 * Enforces Role-Based Access Control (RBAC - Bug #12) and prevents client header impersonation (Bug #13).
 */
export function validateApiAuth(
  request: NextRequest,
  requiredRole?: 'ADMIN' | 'USER'
): AuthValidationResult {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  const apiKeyHeader = request.headers.get('x-api-key') || request.headers.get('X-Api-Key');
  const userIdHeader = request.headers.get('x-user-id') || request.headers.get('X-User-Id');

  let token = apiKeyHeader;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  const expectedAdminKey = process.env.ADMIN_API_KEY || process.env.API_SECRET_KEY;
  const isProd = process.env.NODE_ENV === 'production';

  // 1. Mandatory Token Check for ADMIN endpoints in production or when Admin key is set
  if (requiredRole === 'ADMIN' && (expectedAdminKey || isProd) && !token) {
    return {
      authorized: false,
      userId: '',
      role: 'USER',
      response: NextResponse.json(
        { success: false, error: 'Unauthorized: Требуется заголовок авторизации Authorization: Bearer или x-api-key' },
        { status: 401 }
      )
    };
  }

  // 2. Determine actual user role securely from token (Bug #15 fix: no fallback to startsWith('admin-'))
  const isAdmin = !!expectedAdminKey && token === expectedAdminKey;
  const actualRole: 'ADMIN' | 'USER' = isAdmin ? 'ADMIN' : 'USER';

  // 3. Enforce RBAC Role Requirement (Bug #12)
  if (requiredRole === 'ADMIN' && actualRole !== 'ADMIN') {
    return {
      authorized: false,
      userId: '',
      role: actualRole,
      response: NextResponse.json(
        { success: false, error: 'Forbidden: Недостаточно прав для выполнения административного действия' },
        { status: 403 }
      )
    };
  }

  // 4. Resolve userId deterministically for multi-tenancy isolation (Bug #13, Bug #17)
  // Check for session cookie or session header to isolate users in production when unauthenticated by API token
  const sessionCookie = request.cookies?.get('tender_session_id')?.value;
  const sessionHeader = request.headers.get('x-session-id') || request.headers.get('X-Session-Id');
  const sessionId = sessionCookie || sessionHeader;

  let userId: string;
  if (token) {
    if (isAdmin) {
      userId = 'admin-system-user';
    } else {
      userId = `user-${crypto.createHash('sha256').update(token).digest('hex').substring(0, 12)}`;
    }
  } else if (sessionId) {
    userId = `user-sess-${crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 12)}`;
  } else if (!isProd && userIdHeader) {
    userId = userIdHeader;
  } else {
    userId = 'demo-user-id';
  }

  return {
    authorized: true,
    userId,
    role: actualRole
  };
}
