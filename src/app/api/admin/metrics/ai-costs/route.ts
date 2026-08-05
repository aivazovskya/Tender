import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiAuth(request, 'ADMIN');
    if (!auth.authorized) {
      return auth.response || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [todayAgg, monthAgg, recentUsages] = await Promise.all([
      prisma.aiTokenUsage.aggregate({
        where: { timestamp: { gte: startOfDay } },
        _sum: { costUsd: true, tokensUsed: true, tokensIn: true, tokensOut: true },
        _count: { id: true }
      }),
      prisma.aiTokenUsage.aggregate({
        where: { timestamp: { gte: startOfMonth } },
        _sum: { costUsd: true, tokensUsed: true, tokensIn: true, tokensOut: true },
        _count: { id: true }
      }),
      prisma.aiTokenUsage.findMany({
        take: 20,
        orderBy: { timestamp: 'desc' },
        include: { organization: true }
      })
    ]);

    const todayCost = todayAgg._sum.costUsd || 0;
    const dailyLimit = 5.0; // $5.0 / day limit

    return NextResponse.json({
      success: true,
      data: {
        dailyBudget: {
          limitUsd: dailyLimit,
          spentTodayUsd: Math.round(todayCost * 10000) / 10000,
          remainingUsd: Math.max(0, Math.round((dailyLimit - todayCost) * 10000) / 10000),
          isCircuitBreakerTripped: todayCost >= dailyLimit,
          todayTotalCalls: todayAgg._count.id || 0,
          todayTokensIn: todayAgg._sum.tokensIn || 0,
          todayTokensOut: todayAgg._sum.tokensOut || 0,
          todayTotalTokens: todayAgg._sum.tokensUsed || 0
        },
        monthlyTotals: {
          spentMonthUsd: Math.round((monthAgg._sum.costUsd || 0) * 10000) / 10000,
          monthTotalCalls: monthAgg._count.id || 0,
          monthTotalTokens: monthAgg._sum.tokensUsed || 0
        },
        recentLogs: recentUsages.map(u => ({
          id: u.id,
          provider: u.provider,
          model: u.model,
          tokensIn: u.tokensIn,
          tokensOut: u.tokensOut,
          tokensUsed: u.tokensUsed,
          costUsd: u.costUsd,
          operation: u.operation,
          organizationName: u.organization?.name || null,
          timestamp: u.timestamp
        }))
      }
    });
  } catch (err: any) {
    console.error('[AiCosts GET Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
