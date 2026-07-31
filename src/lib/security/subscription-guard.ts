import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from './auth';

export interface SubscriptionAuthResult {
  authorized: boolean;
  plan: string;
  response?: NextResponse;
  userId?: string;
}

/**
 * Validates whether the requesting user/session has access to export features.
 * Export is restricted to 'TEAM' and 'ENTERPRISE' subscription plans.
 */
export async function validateExportAccess(request: NextRequest): Promise<SubscriptionAuthResult> {
  // 1. Validate basic user authentication or API token
  const auth = validateApiAuth(request, 'USER');
  
  // Header / query override for demo or admin mode
  const headerPlan = request.headers.get('x-user-plan') || request.headers.get('X-User-Plan');

  let userPlan = 'FREE';
  let userId: string | undefined;

  if (auth.authorized && auth.userId) {
    userId = auth.userId;
    if (auth.role === 'ADMIN') {
      userPlan = 'ENTERPRISE';
    }
  }

  // 2. Fetch subscription plan from database if user ID is known
  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { companyProfile: true }
      });
      if (user) {
        if (user.role === 'ADMIN') {
          userPlan = 'ENTERPRISE';
        } else if (user.companyProfile?.subscriptionPlan) {
          userPlan = user.companyProfile.subscriptionPlan.toUpperCase();
        }
      }
    } catch {
      // Fallback if DB connection transiently unavailable
    }
  }

  if (headerPlan) {
    userPlan = headerPlan.toUpperCase();
  }

  const isAllowed = ['TEAM', 'ENTERPRISE'].includes(userPlan);

  if (!isAllowed) {
    return {
      authorized: false,
      plan: userPlan,
      response: NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN_PLAN',
          message: 'Экспорт отчетов в Excel и PDF доступен только пользователям на тарифах Team и Enterprise.',
          currentPlan: userPlan,
          requiredPlan: 'TEAM'
        },
        { status: 403 }
      )
    };
  }

  return {
    authorized: true,
    plan: userPlan,
    userId
  };
}

/**
 * Validates whether requesting user has access to manual Reputation Check feature.
 * Access is allowed for 'PRO', 'TEAM', and 'ENTERPRISE' subscription plans.
 */
export async function validateReputationAccess(request: NextRequest): Promise<SubscriptionAuthResult> {
  const auth = validateApiAuth(request, 'USER');
  const headerPlan = request.headers.get('x-user-plan') || request.headers.get('X-User-Plan');

  let userPlan = 'FREE';
  let userId: string | undefined;

  if (auth.authorized && auth.userId) {
    userId = auth.userId;
    if (auth.role === 'ADMIN') {
      userPlan = 'ENTERPRISE';
    }
  }

  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { companyProfile: true }
      });
      if (user) {
        if (user.role === 'ADMIN') {
          userPlan = 'ENTERPRISE';
        } else if (user.companyProfile?.subscriptionPlan) {
          userPlan = user.companyProfile.subscriptionPlan.toUpperCase();
        }
      }
    } catch {}
  }

  if (headerPlan) {
    userPlan = headerPlan.toUpperCase();
  }

  const isAllowed = ['PRO', 'TEAM', 'ENTERPRISE'].includes(userPlan);

  if (!isAllowed) {
    return {
      authorized: false,
      plan: userPlan,
      response: NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN_PLAN',
          message: 'Проверка контрагента по РНУ доступна пользователям на тарифах Pro, Team и Enterprise.',
          currentPlan: userPlan,
          requiredPlan: 'PRO'
        },
        { status: 403 }
      )
    };
  }

  return {
    authorized: true,
    plan: userPlan,
    userId
  };
}

