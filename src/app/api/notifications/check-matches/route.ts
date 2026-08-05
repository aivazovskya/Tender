import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TelegramBotService } from '@/lib/services/telegram.service';
import { AIService } from '@/lib/services/ai.service';
import { validateApiAuth } from '@/lib/security/auth';
import { CompanyProfileData } from '@/lib/types/tender';

// Fallback in-memory idempotency cache (cacheKey => timestamp)
const notifiedMatchesCache = new Map<string, number>();

/**
 * Check if a match notification was recently sent for this profile & tender.
 * Uses Redis connection if available, with in-memory Map fallback.
 */
async function isNotifiedRecently(cacheKey: string, now: number, ttlMs: number): Promise<boolean> {
  try {
    const { connection } = await import('@/lib/queue/ingestion.queue');
    const val = await connection.get(cacheKey);
    if (val) return true;
  } catch {
    const lastNotified = notifiedMatchesCache.get(cacheKey) || 0;
    if (now - lastNotified <= ttlMs) return true;
  }
  return false;
}

/**
 * Mark a match notification as sent for idempotency protection.
 * TTL default is 7 days (604,800 seconds).
 */
async function markAsNotified(cacheKey: string, now: number, ttlSeconds = 604800): Promise<void> {
  try {
    const { connection } = await import('@/lib/queue/ingestion.queue');
    await connection.set(cacheKey, '1', 'EX', ttlSeconds);
  } catch {
    notifiedMatchesCache.set(cacheKey, now);
  }
}

/**
 * SEMANTICS SPECIFICATION for minRiskNotify:
 * minRiskNotify represents the MAXIMUM ALLOWABLE RISK SCORE (Максимально допустимый порог риска)
 * for sending notifications to a user.
 * 
 * - riskScore ranges from 0 (safest) to 100 (highest risk).
 * - A setting of minRiskNotify = 50 means: "Notify me ONLY for tenders where riskScore <= 50" (i.e. exclude high-risk tenders > 50).
 * - A setting of minRiskNotify = 100 means: "Notify me for all tenders regardless of risk".
 * - Therefore, we filter matched tenders with: tender.riskScore <= (minRiskNotify ?? 50).
 */

export async function GET(request: NextRequest) {
  // Cron & Admin Authentication Guard
  const cronSecretHeader = request.headers.get('x-cron-secret') || request.headers.get('X-Cron-Secret');
  const expectedSecret = process.env.CRON_SECRET || process.env.ADMIN_API_KEY;
  const isProd = process.env.NODE_ENV === 'production';

  if ((expectedSecret || isProd) && cronSecretHeader !== expectedSecret) {
    const auth = await validateApiAuth(request, 'ADMIN');
    if (!auth.authorized && auth.response) {
      return auth.response;
    }
  }

  try {
    const { searchParams } = new URL(request.url);
    const windowHoursParam = searchParams.get('windowHours');
    const windowHours = windowHoursParam ? parseFloat(windowHoursParam) : 1; // Default: last 1 hour
    const sinceDate = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    // 1. Fetch new tenders created in database since window date
    let newTenders = await prisma.tender.findMany({
      where: {
        createdAt: { gte: sinceDate }
      },
      include: {
        documents: true,
        riskFlags: true,
        history: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Fallback: If no tenders were created in the tight 1-hour window (e.g. unseeded/local dev), fetch recent active tenders
    if (newTenders.length === 0) {
      newTenders = await prisma.tender.findMany({
        where: { status: 'ACTIVE' },
        take: 20,
        include: {
          documents: true,
          riskFlags: true,
          history: true
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    if (newTenders.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Нет новых лотов для расчета ИИ-матчинга',
        processedProfilesCount: 0,
        newTendersCount: 0,
        notificationsSentCount: 0,
        notificationsSent: []
      });
    }

    // 2. Fetch all CompanyProfile records with a valid telegramChatId
    const profiles = await prisma.companyProfile.findMany({
      where: {
        telegramChatId: { not: null }
      },
      include: {
        user: {
          include: {
            notificationSetting: true
          }
        }
      }
    });

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const notificationsSent: any[] = [];

    // 3. Process matching per profile
    for (const profile of profiles) {
      // Respect user notification settings
      const notificationSetting = profile.user?.notificationSetting;
      
      // If notificationSetting is present and telegramNotify is explicitly false, skip telegram notification
      if (notificationSetting && notificationSetting.telegramNotify === false) {
        continue;
      }

      const telegramChatId = profile.telegramChatId;
      if (!telegramChatId || telegramChatId.trim().length === 0) {
        continue;
      }

      const maxRiskThreshold = notificationSetting?.minRiskNotify ?? 50;

      // Convert Prisma profile to CompanyProfileData format expected by AIService
      const profileData: CompanyProfileData = {
        companyName: profile.companyName,
        bin: profile.bin,
        activities: profile.activities,
        keywords: profile.keywords,
        regions: profile.regions,
        minAmount: profile.minAmount,
        maxAmount: profile.maxAmount || 0,
        contactEmail: profile.contactEmail,
        telegramChatId: profile.telegramChatId || undefined
      };

      // Run AI semantic matching for profile against new tenders
      const matchedTenders = AIService.matchCompanyProfile(profileData, newTenders as any[]);

      for (const tender of matchedTenders) {
        const matchPercentage = tender.matchPercentage || 0;

        // Threshold 1: Only notify if semantic match is strong (>= 50%)
        if (matchPercentage < 50) continue;

        // Threshold 2: Risk filter check (tender.riskScore <= maxRiskThreshold)
        if (tender.riskScore > maxRiskThreshold) continue;

        // Threshold 3: Idempotency check (7-day window)
        const cacheKey = `match_notified:${profile.id}:${tender.id}`;
        const alreadySent = await isNotifiedRecently(cacheKey, now, sevenDaysMs);

        if (alreadySent) continue;

        // Mark as sent before sending to prevent race conditions
        await markAsNotified(cacheKey, now, 604800);

        const customMessage = 
          `🎯 <b>ИИ-Матчинг: Найден новый релевантный тендер!</b>\n\n` +
          `<b>${tender.title}</b>\n` +
          `📊 Совпадение: <b>${matchPercentage}%</b> (${tender.matchReason})\n` +
          `💰 Сумма: <b>${tender.amount.toLocaleString('ru-RU')} KZT</b>\n` +
          `🏛️ Заказчик: ${tender.customerName} (БИН: ${tender.customerBin})\n` +
          `📍 Регион: ${tender.region}\n` +
          `⏳ Дедлайн: ${new Date(tender.deadlineDate).toLocaleDateString('ru-RU')}\n` +
          `🛡️ Риск-индекс: ${tender.riskScore}/100 (порог <= ${maxRiskThreshold})\n\n` +
          `🔗 <a href="${tender.sourceUrl}">Перейти на ${tender.source}</a>`;

        const result = await TelegramBotService.sendNotification(tender as any, telegramChatId, customMessage);

        notificationsSent.push({
          profileId: profile.id,
          companyName: profile.companyName,
          tenderId: tender.id,
          externalId: tender.externalId,
          matchPercentage,
          riskScore: tender.riskScore,
          maxRiskThreshold,
          telegramChatId,
          deliveryResult: result
        });
      }
    }

    return NextResponse.json({
      success: true,
      processedProfilesCount: profiles.length,
      newTendersCount: newTenders.length,
      notificationsSentCount: notificationsSent.length,
      notificationsSent
    });
  } catch (error: any) {
    console.error('[API /api/notifications/check-matches Error]:', error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || 'Ошибка проверки ИИ-матчинга лотов' },
      { status: 500 }
    );
  }
}
