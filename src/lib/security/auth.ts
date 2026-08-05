import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession } from './auth-store';

export interface AuthValidationResult {
  authorized: boolean;
  response?: NextResponse;
  userId: string;
  role: 'ADMIN' | 'USER';
}

/**
 * Validates request authorization token / API key or Session ID against the database.
 * Resolves current user ID (userId) for multi-tenancy.
 */
export async function validateApiAuth(
  request: NextRequest,
  requiredRole?: 'ADMIN' | 'USER'
): Promise<AuthValidationResult> {
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

  // 2. Determine actual user role securely from token
  const isAdmin = !!expectedAdminKey && token === expectedAdminKey;
  let actualRole: 'ADMIN' | 'USER' = isAdmin ? 'ADMIN' : 'USER';

  // 3. Enforce RBAC Role Requirement
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

  // 4. Resolve userId & validate Session in DB / Store
  const sessionCookie = request.cookies?.get('tender_session_id')?.value;
  const sessionHeader = request.headers.get('x-session-id') || request.headers.get('X-Session-Id');
  const sessionId = sessionCookie || sessionHeader;

  let userId = '';

  if (token) {
    if (isAdmin) {
      userId = 'admin-system-user';
    } else {
      userId = `user-${crypto.createHash('sha256').update(token).digest('hex').substring(0, 12)}`;
    }
  } else if (sessionId) {
    try {
      const sessionResult = await getSession(sessionId);

      if (!sessionResult) {
        return {
          authorized: false,
          userId: '',
          role: 'USER',
          response: NextResponse.json(
            { success: false, error: 'Unauthorized: Сессия истекла или недействительна' },
            { status: 401 }
          )
        };
      }

      userId = sessionResult.session.userId;
      if (sessionResult.user?.role === 'ADMIN') {
        actualRole = 'ADMIN';
      }
    } catch (err: any) {
      if (err?.message === 'AUTH_STORE_UNAVAILABLE' || err?.name === 'AuthStoreUnavailableError') {
        return {
          authorized: false,
          userId: '',
          role: 'USER',
          response: NextResponse.json(
            { success: false, message: 'Сервис авторизации временно недоступен. Попробуйте позже.' },
            { status: 503 }
          )
        };
      }
      throw err;
    }
  } else if (!isProd && userIdHeader) {
    userId = userIdHeader;
  } else if (process.env.ALLOW_DEMO_AUTH === 'true') {
    userId = 'demo-user-id';
  } else {
    return {
      authorized: false,
      userId: '',
      role: 'USER',
      response: NextResponse.json(
        { success: false, error: 'Unauthorized: Требуется вход в систему' },
        { status: 401 }
      )
    };
  }

  return {
    authorized: true,
    userId,
    role: actualRole
  };
}
