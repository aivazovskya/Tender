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
 * Resolves the effective subscription plan for a user, taking into account:
 * 1. Admin role -> 'ENTERPRISE'
 * 2. User's personal company profile subscription plan
 * 3. Any organization memberships the user belongs to (e.g. TEAM, ENTERPRISE)
 * Returns the highest ranking plan ('FREE' < 'PRO' < 'TEAM' < 'ENTERPRISE').
 */
export async function resolveEffectiveUserPlan(userId: string): Promise<string> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return 'FREE';
  }

  // Task 9: When billing is disabled (internal use / no subscriptions sold),
  // immediately grant full ENTERPRISE access to all authenticated users without DB roundtrip.
  if (process.env.BILLING_ENABLED !== 'true') {
    return 'ENTERPRISE';
  }

  const PLAN_RANKS: Record<string, number> = {
    FREE: 0,
    PRO: 1,
    TEAM: 2,
    ENTERPRISE: 3
  };

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        companyProfile: true,
        orgMemberships: {
          include: {
            organization: true
          }
        }
      }
    });

    if (!user) return 'FREE';
    if (user.role === 'ADMIN') return 'ENTERPRISE';

    let highestPlan = 'FREE';
    let highestRank = 0;

    const personalPlan = user.companyProfile?.subscriptionPlan?.toUpperCase();
    if (personalPlan && PLAN_RANKS[personalPlan] !== undefined) {
      if (PLAN_RANKS[personalPlan] > highestRank) {
        highestPlan = personalPlan;
        highestRank = PLAN_RANKS[personalPlan];
      }
    }

    for (const membership of user.orgMemberships || []) {
      const orgPlan = membership.organization?.subscriptionPlan?.toUpperCase();
      if (orgPlan && PLAN_RANKS[orgPlan] !== undefined) {
        if (PLAN_RANKS[orgPlan] > highestRank) {
          highestPlan = orgPlan;
          highestRank = PLAN_RANKS[orgPlan];
        }
      }
    }

    return highestPlan;
  } catch {
    return 'FREE';
  }
}

/**
 * Validates whether the requesting user/session has access to export features.
 * Export is restricted to 'TEAM' and 'ENTERPRISE' subscription plans.
 */
export async function validateExportAccess(request: NextRequest): Promise<SubscriptionAuthResult> {
  // 1. Validate basic user authentication or API token
  const auth = await validateApiAuth(request, 'USER');
  if (!auth.authorized) {
    return {
      authorized: false,
      plan: 'FREE',
      response: auth.response || NextResponse.json(
        { success: false, message: 'Необходима авторизация' },
        { status: 401 }
      )
    };
  }
  
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
    if (auth.role === 'ADMIN') {
      userPlan = 'ENTERPRISE';
    } else {
      userPlan = await resolveEffectiveUserPlan(userId);
    }
  }

  const isProd = process.env.NODE_ENV === 'production';
  const allowDemoAuth = process.env.ALLOW_DEMO_AUTH === 'true';

  // Header override allowed ONLY in non-production environments when ALLOW_DEMO_AUTH is explicitly enabled
  if (headerPlan && !isProd && allowDemoAuth) {
    userPlan = headerPlan.toUpperCase();
  }

  // In production, export is strictly restricted to TEAM and ENTERPRISE plans
  const allowUnrestrictedAccess = !isProd && (allowDemoAuth || process.env.BYPASS_SUBSCRIPTION_LIMITS === 'true');
  const isAllowed = allowUnrestrictedAccess || ['TEAM', 'ENTERPRISE'].includes(userPlan);

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
  const auth = await validateApiAuth(request, 'USER');
  if (!auth.authorized) {
    return {
      authorized: false,
      plan: 'FREE',
      response: auth.response || NextResponse.json(
        { success: false, message: 'Необходима авторизация' },
        { status: 401 }
      )
    };
  }
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
    if (auth.role === 'ADMIN') {
      userPlan = 'ENTERPRISE';
    } else {
      userPlan = await resolveEffectiveUserPlan(userId);
    }
  }

  const isProd = process.env.NODE_ENV === 'production';
  const allowDemoAuth = process.env.ALLOW_DEMO_AUTH === 'true';

  // Header override allowed ONLY in non-production environments when ALLOW_DEMO_AUTH is explicitly enabled
  if (headerPlan && !isProd && allowDemoAuth) {
    userPlan = headerPlan.toUpperCase();
  }

  // In production, reputation checks are strictly restricted to PRO, TEAM and ENTERPRISE plans
  const allowUnrestrictedAccess = !isProd && (allowDemoAuth || process.env.BYPASS_SUBSCRIPTION_LIMITS === 'true');
  const isAllowed = allowUnrestrictedAccess || ['PRO', 'TEAM', 'ENTERPRISE'].includes(userPlan);

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

