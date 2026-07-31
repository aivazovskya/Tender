import { prisma } from '../prisma';
import { RateLimiter } from '../ingestion/base.adapter';
import { ReputationEntityType, ReputationCheckResult } from '../types/tender';

export type { ReputationEntityType, ReputationCheckResult };

// In-memory fallback cache for environments without DB connection
const memoryReputationCache = new Map<string, any>();
const rateLimiter = new RateLimiter(500, 3);

/**
 * Service for checking customer/supplier reputation against Kazakhstani Registries.
 * Phase 1: Integrated with Goszakup RNU (Реестр недобросовестных участников ГЗ).
 * Note: Bankruptcy, Tax Debt, and Court Decisions are scheduled for Phase 2 backlog.
 * 
 * ReputationCheckResult Status Semantics:
 * - 'CLEAN': Successfully queried RNU API and no active blacklisting records were found.
 * - 'BLACKLISTED': Active blacklisting record found in RNU.
 * - 'NOT_FOUND': Reserved for subject lookup integration (when BIN is not a registered procurement subject).
 * - 'UNKNOWN': API HTTP error (404/500), network failure, invalid JSON response, or service unavailable.
 */
export class ReputationService {
  /**
   * Validates 12-digit Kazakhstani BIN/IIN format
   */
  static isValidBin(bin: string): boolean {
    if (!bin) return false;
    const cleaned = bin.trim();
    return /^\d{12}$/.test(cleaned);
  }

  /**
   * Main reputation check method with 24h caching, rate limiting, and expired ban filter.
   */
  static async checkBin(
    bin: string,
    entityType: ReputationEntityType = 'CUSTOMER'
  ): Promise<ReputationCheckResult> {
    const cleanedBin = (bin || '').trim();

    if (!this.isValidBin(cleanedBin)) {
      throw new Error('Некорректный формат БИН/ИИН. Ожидается ровно 12 цифр.');
    }

    const cacheKey = `${cleanedBin}_${entityType}`;
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Check DB Cache
    let cachedRecord: any = null;
    try {
      cachedRecord = await (prisma as any).reputationCheck.findUnique({
        where: {
          bin_entityType: {
            bin: cleanedBin,
            entityType: entityType as any
          }
        }
      });
    } catch {
      // Fallback to memory cache if DB transiently unavailable
      cachedRecord = memoryReputationCache.get(cacheKey);
    }

    // Return fresh cache if not expired
    if (cachedRecord && new Date(cachedRecord.expiresAt) > now) {
      const isStillBanned = this.evaluateBanStatus(cachedRecord.isBlacklisted, cachedRecord.banEndDate);
      return {
        bin: cleanedBin,
        entityType,
        isBlacklisted: isStillBanned,
        registryRecordId: cachedRecord.registryRecordId || null,
        reason: cachedRecord.reason || null,
        banStartDate: cachedRecord.banStartDate ? new Date(cachedRecord.banStartDate).toISOString() : null,
        banEndDate: cachedRecord.banEndDate ? new Date(cachedRecord.banEndDate).toISOString() : null,
        status: isStillBanned ? 'BLACKLISTED' : 'CLEAN',
        stale: false,
        checkedAt: new Date(cachedRecord.checkedAt).toISOString(),
        expiresAt: new Date(cachedRecord.expiresAt).toISOString(),
        source: 'Goszakup RNU (РНУ ГЗ)'
      };
    }

    // 2. Query Goszakup RNU API via RateLimiter
    try {
      const apiResult = await rateLimiter.executeWithBackoff(async () => {
        return await this.fetchGoszakupRnuApi(cleanedBin);
      });

      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24-hour cache TTL
      const isBlacklisted = apiResult.isBlacklisted;

      const resultData: ReputationCheckResult = {
        bin: cleanedBin,
        entityType,
        isBlacklisted,
        registryRecordId: apiResult.registryRecordId || null,
        reason: apiResult.reason || null,
        banStartDate: apiResult.banStartDate ? apiResult.banStartDate.toISOString() : null,
        banEndDate: apiResult.banEndDate ? apiResult.banEndDate.toISOString() : null,
        status: apiResult.status,
        stale: false,
        checkedAt: nowIso,
        expiresAt: expiresAt.toISOString(),
        source: 'Goszakup RNU (РНУ ГЗ)'
      };

      // Save/Upsert into DB
      try {
        await (prisma as any).reputationCheck.upsert({
          where: {
            bin_entityType: {
              bin: cleanedBin,
              entityType: entityType as any
            }
          },
          update: {
            isBlacklisted: resultData.isBlacklisted,
            registryRecordId: resultData.registryRecordId,
            reason: resultData.reason,
            banStartDate: resultData.banStartDate ? new Date(resultData.banStartDate) : null,
            banEndDate: resultData.banEndDate ? new Date(resultData.banEndDate) : null,
            rawResponse: apiResult.raw || null,
            checkedAt: now,
            expiresAt
          },
          create: {
            bin: cleanedBin,
            entityType: entityType as any,
            isBlacklisted: resultData.isBlacklisted,
            registryRecordId: resultData.registryRecordId,
            reason: resultData.reason,
            banStartDate: resultData.banStartDate ? new Date(resultData.banStartDate) : null,
            banEndDate: resultData.banEndDate ? new Date(resultData.banEndDate) : null,
            rawResponse: apiResult.raw || null,
            checkedAt: now,
            expiresAt
          }
        });
      } catch {
        memoryReputationCache.set(cacheKey, {
          bin: cleanedBin,
          entityType,
          isBlacklisted: resultData.isBlacklisted,
          registryRecordId: resultData.registryRecordId,
          reason: resultData.reason,
          banStartDate: resultData.banStartDate,
          banEndDate: resultData.banEndDate,
          checkedAt: nowIso,
          expiresAt: expiresAt.toISOString()
        });
      }

      return resultData;
    } catch (apiErr: any) {
      console.error(`[ReputationService] Внешняя проверка РНУ завершилась ошибкой: ${apiErr?.message || apiErr}`);

      // 3. Fallback: Return stale cache if available, or UNKNOWN/stale without crashing
      if (cachedRecord) {
        const isStillBanned = this.evaluateBanStatus(cachedRecord.isBlacklisted, cachedRecord.banEndDate);
        return {
          bin: cleanedBin,
          entityType,
          isBlacklisted: isStillBanned,
          registryRecordId: cachedRecord.registryRecordId || null,
          reason: cachedRecord.reason || null,
          banStartDate: cachedRecord.banStartDate ? new Date(cachedRecord.banStartDate).toISOString() : null,
          banEndDate: cachedRecord.banEndDate ? new Date(cachedRecord.banEndDate).toISOString() : null,
          status: isStillBanned ? 'BLACKLISTED' : 'CLEAN',
          stale: true,
          checkedAt: new Date(cachedRecord.checkedAt).toISOString(),
          expiresAt: new Date(cachedRecord.expiresAt).toISOString(),
          source: 'Goszakup RNU (РНУ ГЗ)'
        };
      }

      return {
        bin: cleanedBin,
        entityType,
        isBlacklisted: false,
        registryRecordId: null,
        reason: `Внешний сервис РНУ недоступен: ${apiErr?.message || 'Ошибка сети/API'}`,
        banStartDate: null,
        banEndDate: null,
        status: 'UNKNOWN',
        stale: true,
        checkedAt: nowIso,
        expiresAt: nowIso,
        source: 'Goszakup RNU (РНУ ГЗ)'
      };
    }
  }

  /**
   * Helper to evaluate active ban status based on banEndDate
   */
  private static evaluateBanStatus(isBlacklisted: boolean, banEndDate?: Date | string | null): boolean {
    if (!isBlacklisted) return false;
    if (!banEndDate) return true; // Blacklisted indefinitely or active
    const endDate = new Date(banEndDate);
    if (isNaN(endDate.getTime())) return isBlacklisted;
    return endDate.getTime() >= Date.now();
  }

  /**
   * Internal API client for Goszakup OWS RNU service.
   * Throws explicit error on HTTP non-200, network error, or invalid JSON so checkBin returns UNKNOWN/stale.
   */
  private static async fetchGoszakupRnuApi(bin: string): Promise<{
    isBlacklisted: boolean;
    registryRecordId?: string;
    reason?: string;
    banStartDate?: Date;
    banEndDate?: Date;
    status: 'CLEAN' | 'BLACKLISTED' | 'NOT_FOUND' | 'UNKNOWN';
    raw?: any;
  }> {
    const token = process.env.GOSZAKUP_API_TOKEN || process.env.SAMRUK_API_TOKEN;

    if (!token || token.includes('your_goszakup')) {
      // Demo/Unconfigured API token mode: return clean mock without throwing
      return {
        isBlacklisted: false,
        status: 'CLEAN'
      };
    }

    const url = `https://ows.goszakup.gov.kz/v3/rnu/bin/${encodeURIComponent(bin)}`;
    
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
    } catch (netErr: any) {
      console.error(`[ReputationService] Ошибка сети при запросе OWS API (${url}):`, netErr?.message || netErr);
      throw new Error(`Ошибка сети OWS API: ${netErr?.message || 'Network failure'}`);
    }

    if (!response.ok) {
      console.error(`[ReputationService] OWS API вернул HTTP ${response.status} ${response.statusText} (${url})`);
      throw new Error(`OWS API HTTP ${response.status}: ${response.statusText}`);
    }

    let json: any;
    try {
      json = await response.json();
    } catch (parseErr: any) {
      console.error(`[ReputationService] Некорректный JSON от OWS API:`, parseErr?.message || parseErr);
      throw new Error(`Некорректный JSON от OWS API: ${parseErr?.message}`);
    }

    const items = Array.isArray(json) ? json : json?.items || json?.data || [];

    if (items.length > 0) {
      const activeRecord = items.find((rec: any) => {
        const endDateStr = rec.end_date || rec.ban_end_date || rec.endDate;
        if (!endDateStr) return true;
        return new Date(endDateStr).getTime() >= Date.now();
      });

      if (activeRecord) {
        const startDateStr = activeRecord.start_date || activeRecord.ban_start_date || activeRecord.startDate;
        const endDateStr = activeRecord.end_date || activeRecord.ban_end_date || activeRecord.endDate;
        return {
          isBlacklisted: true,
          registryRecordId: String(activeRecord.id || activeRecord.rnu_id || `RNU-${bin}`),
          reason: activeRecord.reason || activeRecord.description || 'Включен в Реестр недобросовестных участников Госзакупок РК',
          banStartDate: startDateStr ? new Date(startDateStr) : undefined,
          banEndDate: endDateStr ? new Date(endDateStr) : undefined,
          status: 'BLACKLISTED',
          raw: json
        };
      }
    }

    return {
      isBlacklisted: false,
      status: 'CLEAN',
      raw: json
    };
  }
}
