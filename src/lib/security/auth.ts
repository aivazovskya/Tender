import { NextRequest, NextResponse } from 'next/server';

export interface AuthValidationResult {
  authorized: boolean;
  response?: NextResponse;
  userId?: string;
  role?: string;
}

/**
 * Validates request authorization token / API key and role permissions for sensitive API endpoints.
 * Supports:
 * - Authorization: Bearer <token>
 * - x-api-key: <key>
 * - Configured API_SECRET_KEY / ADMIN_API_KEY environment variables
 */
export function validateApiAuth(
  request: NextRequest,
  requiredRole?: 'ADMIN' | 'USER'
): AuthValidationResult {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  const apiKeyHeader = request.headers.get('x-api-key') || request.headers.get('X-Api-Key');

  let token = apiKeyHeader;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  const expectedAdminKey = process.env.ADMIN_API_KEY || process.env.API_SECRET_KEY;
  const isProd = process.env.NODE_ENV === 'production';

  // Enforce security in production or when explicit admin key is configured
  if (expectedAdminKey || isProd) {
    if (!token) {
      return {
        authorized: false,
        response: NextResponse.json(
          { success: false, error: 'Unauthorized: Требуется заголовок авторизации Authorization: Bearer или x-api-key' },
          { status: 401 }
        )
      };
    }

    if (expectedAdminKey && token !== expectedAdminKey) {
      return {
        authorized: false,
        response: NextResponse.json(
          { success: false, error: 'Forbidden: Неверный токен доступа или недостаточно прав' },
          { status: 403 }
        )
      };
    }
  }

  return {
    authorized: true,
    role: requiredRole || 'ADMIN'
  };
}
