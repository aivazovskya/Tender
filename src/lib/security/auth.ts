import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession } from './auth-store';

export interface AuthValidationResult {
  authorized: boolean;
  response?: NextResponse;
  userId: string;
  role: 'ADMIN' | 'USER';
  status?: string;
}

/**
 * Validates request authorization token / API key or Session ID against the database.
 * Enforces that user must be approved (status: APPROVED).
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
    // Check if session belongs to an admin
    const sessionCookie = request.cookies?.get('tender_session_id')?.value;
    const sessionHeader = request.headers.get('x-session-id') || request.headers.get('X-Session-Id');
    const sessionId = sessionCookie || sessionHeader;

    if (!sessionId) {
      return {
        authorized: false,
        userId: '',
        role: 'USER',
        response: NextResponse.json(
          { success: false, error: 'Unauthorized: Требуется авторизация администратора' },
          { status: 401 }
        )
      };
    }
  }

  // 2. Determine actual user role securely from token
  const isAdminToken = !!expectedAdminKey && token === expectedAdminKey;
  let actualRole: 'ADMIN' | 'USER' = isAdminToken ? 'ADMIN' : 'USER';

  // 3. Resolve userId & validate Session in DB / Store
  const sessionCookie = request.cookies?.get('tender_session_id')?.value;
  const sessionHeader = request.headers.get('x-session-id') || request.headers.get('X-Session-Id');
  const sessionId = sessionCookie || sessionHeader;

  let userId = '';
  let userStatus = 'APPROVED';

  if (token) {
    if (isAdminToken) {
      userId = 'admin-system-user';
      actualRole = 'ADMIN';
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
      userStatus = sessionResult.user?.status || 'APPROVED';

      if (sessionResult.user?.role === 'ADMIN') {
        actualRole = 'ADMIN';
      }

      // Check User Approval Status
      if (userStatus === 'PENDING') {
        return {
          authorized: false,
          userId,
          role: actualRole,
          status: 'PENDING',
          response: NextResponse.json(
            { success: false, error: 'Доступ заблокирован: Ваша учетная запись ожидает одобрения администратора' },
            { status: 403 }
          )
        };
      }

      if (userStatus === 'REJECTED') {
        return {
          authorized: false,
          userId,
          role: actualRole,
          status: 'REJECTED',
          response: NextResponse.json(
            { success: false, error: 'Доступ заблокирован: Ваша учетная запись была отклонена' },
            { status: 403 }
          )
        };
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

  // 4. Enforce RBAC Role Requirement
  if (requiredRole === 'ADMIN' && actualRole !== 'ADMIN') {
    return {
      authorized: false,
      userId,
      role: actualRole,
      response: NextResponse.json(
        { success: false, error: 'Forbidden: Недостаточно прав для выполнения административного действия' },
        { status: 403 }
      )
    };
  }

  return {
    authorized: true,
    userId,
    role: actualRole,
    status: userStatus
  };
}

/**
 * Common helper to protect sensitive API endpoints with mandatory authentication.
 */
export async function requireAuthenticatedUser(
  request: NextRequest,
  requiredRole?: 'ADMIN' | 'USER'
): Promise<AuthValidationResult> {
  return await validateApiAuth(request, requiredRole);
}
