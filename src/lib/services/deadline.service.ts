import { prisma } from '../prisma';
import { CompetitionService } from './competition.service';

export type DeadlineType =
  | 'SUBMISSION_DEADLINE'
  | 'CLARIFICATION_DEADLINE'
  | 'SECURITY_DEPOSIT_DEADLINE'
  | 'APPEAL_DEADLINE'
  | 'CONTRACT_SIGNING_DEADLINE'
  | 'CUSTOM';

export type DeadlineStatus = 'PENDING' | 'COMPLETED' | 'MISSED' | 'CANCELLED';

export type CriticalityZone = 'CRITICAL' | 'SOON' | 'MEDIUM' | 'PLANNED';

export interface DeadlineRecord {
  id: string;
  tenderId: string;
  companyId: string;
  type: DeadlineType;
  dueAt: Date;
  status: DeadlineStatus;
  title?: string | null;
  notifiedAt?: Date | null;
  completedAt?: Date | null;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeadlineWithUrgency extends DeadlineRecord {
  tender: {
    id: string;
    title: string;
    amount: number;
    currency: string;
    customerName: string;
    customerBin: string;
    region: string;
    category: string;
    procurementMethod: string;
    source: string;
    sourceUrl: string;
  };
  urgencyScore: number;
  urgencyByTime: number;
  urgencyByValue: number;
  urgencyByWinProbability: number | null;
  criticalityZone: CriticalityZone;
  daysRemaining: number;
}

// In-memory store for test/offline environment without DB
const memoryDeadlines = new Map<string, DeadlineRecord>();
const memoryTenders = new Map<string, any>();

function isMemoryMode(): boolean {
  return process.env.AUTH_STORE_MODE === 'memory';
}

export class DeadlineService {
  /**
   * Helper to compute urgencyByTime (0 - 100)
   */
  static calculateUrgencyByTime(dueAt: Date): number {
    const now = Date.now();
    const daysRemaining = (new Date(dueAt).getTime() - now) / (1000 * 60 * 60 * 24);

    if (daysRemaining <= 1) return 100;
    if (daysRemaining <= 3) return 80;
    if (daysRemaining <= 7) return 50;
    if (daysRemaining <= 14) return 25;
    return 10;
  }

  /**
   * Helper to compute CriticalityZone
   */
  static getCriticalityZone(dueAt: Date): CriticalityZone {
    const now = Date.now();
    const hoursRemaining = (new Date(dueAt).getTime() - now) / (1000 * 60 * 60);
    const daysRemaining = hoursRemaining / 24;

    if (hoursRemaining <= 48) return 'CRITICAL';
    if (daysRemaining <= 7) return 'SOON';
    if (daysRemaining <= 14) return 'MEDIUM';
    return 'PLANNED';
  }

  /**
   * Calculate composite UrgencyScore (0 - 100)
   */
  static calculateUrgencyScore(
    dueAt: Date,
    tenderAmount: number,
    companyMedianAmount: number,
    winProbability: number | null
  ): {
    urgencyScore: number;
    urgencyByTime: number;
    urgencyByValue: number;
    urgencyByWinProbability: number | null;
  } {
    const urgencyByTime = this.calculateUrgencyByTime(dueAt);

    let urgencyByValue = 0;
    if (companyMedianAmount > 0) {
      const valueRatio = tenderAmount / companyMedianAmount;
      urgencyByValue = Math.min(100, Math.round(valueRatio * 50));
    }

    let wTime = Number(process.env.DEADLINE_WEIGHT_TIME || 0.5);
    let wValue = Number(process.env.DEADLINE_WEIGHT_VALUE || 0.3);
    let wWin = Number(process.env.DEADLINE_WEIGHT_WIN || 0.2);

    let urgencyByWinProbability: number | null = winProbability;

    if (winProbability === null || winProbability === undefined) {
      urgencyByWinProbability = null;
      wTime = 0.7;
      wValue = 0.3;
      wWin = 0;
    }

    const urgencyScore = Math.round(
      urgencyByTime * wTime +
      urgencyByValue * wValue +
      (urgencyByWinProbability || 0) * wWin
    );

    return {
      urgencyScore: Math.min(100, Math.max(0, urgencyScore)),
      urgencyByTime,
      urgencyByValue,
      urgencyByWinProbability
    };
  }

  /**
   * Calculates median lot amount for company's tenders
   */
  static calculateMedianAmount(amounts: number[]): number {
    if (!amounts || amounts.length === 0) return 0;
    const sorted = [...amounts].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 !== 0) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Returns list of deadlines for company with urgency calculations & sorting
   */
  static async getCompanyDeadlines(
    companyId: string,
    filters?: {
      status?: DeadlineStatus;
      type?: DeadlineType;
      criticalityZone?: CriticalityZone;
    }
  ): Promise<DeadlineWithUrgency[]> {
    let rawDeadlines: any[] = [];

    if (isMemoryMode()) {
      rawDeadlines = Array.from(memoryDeadlines.values()).filter(
        d => d.companyId === companyId
      ).map(d => {
        const tender = memoryTenders.get(d.tenderId) || {
          id: d.tenderId,
          title: 'Тестовый тендер',
          amount: 50000000,
          currency: 'KZT',
          customerName: 'Заказчик',
          customerBin: '123456789012',
          region: 'Алматы',
          category: 'Строительство',
          procurementMethod: 'OPEN_TENDER',
          source: 'Госзакуп',
          sourceUrl: 'https://goszakup.gov.kz'
        };
        return { ...d, tender };
      });
    } else {
      try {
        rawDeadlines = await prisma.tenderDeadline.findMany({
          where: {
            companyId,
            ...(filters?.status ? { status: filters.status } : {}),
            ...(filters?.type ? { type: filters.type } : {})
          },
          include: {
            tender: {
              select: {
                id: true,
                title: true,
                amount: true,
                currency: true,
                customerName: true,
                customerBin: true,
                region: true,
                category: true,
                procurementMethod: true,
                source: true,
                sourceUrl: true
              }
            }
          }
        });
      } catch (err: any) {
        console.warn('[DeadlineService] DB error in findMany:', err?.message);
        rawDeadlines = Array.from(memoryDeadlines.values()).filter(d => d.companyId === companyId);
      }
    }

    if (rawDeadlines.length === 0) {
      return [];
    }

    // Calculate median amount for company
    const amounts = rawDeadlines.map(d => Number(d.tender?.amount || 0)).filter(a => a > 0);
    const medianAmount = this.calculateMedianAmount(amounts);

    const result: DeadlineWithUrgency[] = [];

    for (const d of rawDeadlines) {
      if (filters?.status && d.status !== filters.status) continue;
      if (filters?.type && d.type !== filters.type) continue;

      const dueAt = new Date(d.dueAt);
      const tenderAmount = Number(d.tender?.amount || 0);

      // Fetch CompetitionEstimate if tender data exists
      let winProb: number | null = null;
      if (d.tender) {
        try {
          const compEst = await CompetitionService.estimate(d.tender as any);
          winProb = compEst.winProbability;
        } catch {
          winProb = null;
        }
      }

      const urgency = this.calculateUrgencyScore(dueAt, tenderAmount, medianAmount, winProb);
      const criticalityZone = this.getCriticalityZone(dueAt);

      if (filters?.criticalityZone && criticalityZone !== filters.criticalityZone) {
        continue;
      }

      const daysRemaining = Math.max(
        0,
        Math.round((dueAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      );

      result.push({
        id: d.id,
        tenderId: d.tenderId,
        companyId: d.companyId,
        type: d.type as DeadlineType,
        dueAt,
        status: d.status as DeadlineStatus,
        title: d.title || null,
        notifiedAt: d.notifiedAt ? new Date(d.notifiedAt) : null,
        completedAt: d.completedAt ? new Date(d.completedAt) : null,
        createdBy: d.createdBy || null,
        createdAt: new Date(d.createdAt),
        updatedAt: new Date(d.updatedAt),
        tender: d.tender || {
          id: d.tenderId,
          title: 'Тендер',
          amount: 0,
          currency: 'KZT',
          customerName: 'Заказчик',
          customerBin: '',
          region: '',
          category: '',
          procurementMethod: 'OPEN_TENDER',
          source: 'Госзакуп',
          sourceUrl: ''
        },
        urgencyScore: urgency.urgencyScore,
        urgencyByTime: urgency.urgencyByTime,
        urgencyByValue: urgency.urgencyByValue,
        urgencyByWinProbability: urgency.urgencyByWinProbability,
        criticalityZone,
        daysRemaining
      });
    }

    // Sort by urgencyScore DESC, then dueAt ASC
    return result.sort((a, b) => {
      if (b.urgencyScore !== a.urgencyScore) {
        return b.urgencyScore - a.urgencyScore;
      }
      return a.dueAt.getTime() - b.dueAt.getTime();
    });
  }

  /**
   * Creates new deadline
   */
  static async createDeadline(data: {
    tenderId: string;
    companyId: string;
    type: DeadlineType;
    dueAt: Date;
    title?: string | null;
    createdBy?: string | null;
  }): Promise<DeadlineRecord> {
    const id = `ddl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: DeadlineRecord = {
      id,
      tenderId: data.tenderId,
      companyId: data.companyId,
      type: data.type,
      dueAt: new Date(data.dueAt),
      status: 'PENDING',
      title: data.title || null,
      notifiedAt: null,
      completedAt: null,
      createdBy: data.createdBy || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (isMemoryMode()) {
      memoryDeadlines.set(id, record);
      return record;
    }

    try {
      const dbRecord = await prisma.tenderDeadline.create({
        data: {
          id,
          tenderId: data.tenderId,
          companyId: data.companyId,
          type: data.type,
          dueAt: new Date(data.dueAt),
          status: 'PENDING',
          title: data.title || null,
          createdBy: data.createdBy || null
        }
      });
      memoryDeadlines.set(id, dbRecord as any);
      return dbRecord as any;
    } catch (err: any) {
      console.warn('[DeadlineService] DB fallback createDeadline:', err?.message);
      memoryDeadlines.set(id, record);
      return record;
    }
  }

  /**
   * Auto-creates SUBMISSION_DEADLINE for a tender and company if not existing
   */
  static async autoCreateSubmissionDeadline(
    tenderId: string,
    companyId: string,
    deadlineDate: Date
  ): Promise<DeadlineRecord | null> {
    if (isMemoryMode()) {
      const existing = Array.from(memoryDeadlines.values()).find(
        d => d.tenderId === tenderId && d.companyId === companyId && d.type === 'SUBMISSION_DEADLINE'
      );
      if (existing) return existing;
      return this.createDeadline({
        tenderId,
        companyId,
        type: 'SUBMISSION_DEADLINE',
        dueAt: deadlineDate,
        title: 'Дата окончания приёма заявок'
      });
    }

    try {
      const existing = await prisma.tenderDeadline.findFirst({
        where: {
          tenderId,
          companyId,
          type: 'SUBMISSION_DEADLINE'
        }
      });
      if (existing) return existing as any;

      return await this.createDeadline({
        tenderId,
        companyId,
        type: 'SUBMISSION_DEADLINE',
        dueAt: deadlineDate,
        title: 'Дата окончания приёма заявок'
      });
    } catch (err: any) {
      console.warn('[DeadlineService] DB fallback autoCreateSubmissionDeadline:', err?.message);
      return this.createDeadline({
        tenderId,
        companyId,
        type: 'SUBMISSION_DEADLINE',
        dueAt: deadlineDate,
        title: 'Дата окончания приёма заявок'
      });
    }
  }

  /**
   * Auto-creates APPEAL_DEADLINE for a tender and company if not existing and dueAt is in the future
   */
  static async autoCreateAppealDeadline(
    tenderId: string,
    companyId: string,
    resultDate: Date,
    appealWindowDays: number = Number(process.env.APPEAL_WINDOW_DAYS || 10)
  ): Promise<DeadlineRecord | null> {
    const dueAt = new Date(new Date(resultDate).getTime() + appealWindowDays * 24 * 60 * 60 * 1000);
    if (dueAt <= new Date()) return null;

    if (isMemoryMode()) {
      const existing = Array.from(memoryDeadlines.values()).find(
        d => d.tenderId === tenderId && d.companyId === companyId && d.type === 'APPEAL_DEADLINE'
      );
      if (existing) return existing;
      return this.createDeadline({
        tenderId,
        companyId,
        type: 'APPEAL_DEADLINE',
        dueAt,
        title: 'Срок подачи жалобы на результаты закупки'
      });
    }

    try {
      const existing = await prisma.tenderDeadline.findFirst({
        where: {
          tenderId,
          companyId,
          type: 'APPEAL_DEADLINE'
        }
      });
      if (existing) return existing as any;

      return await this.createDeadline({
        tenderId,
        companyId,
        type: 'APPEAL_DEADLINE',
        dueAt,
        title: 'Срок подачи жалобы на результаты закупки'
      });
    } catch (err: any) {
      console.warn('[DeadlineService] DB fallback autoCreateAppealDeadline:', err?.message);
      const memExisting = Array.from(memoryDeadlines.values()).find(
        d => d.tenderId === tenderId && d.companyId === companyId && d.type === 'APPEAL_DEADLINE'
      );
      if (memExisting) return memExisting;

      return this.createDeadline({
        tenderId,
        companyId,
        type: 'APPEAL_DEADLINE',
        dueAt,
        title: 'Срок подачи жалобы на результаты закупки'
      });
    }
  }

  /**
   * Updates deadline status, title, dueAt
   */
  static async updateDeadline(
    id: string,
    companyId: string,
    data: {
      status?: DeadlineStatus;
      dueAt?: Date;
      title?: string | null;
    }
  ): Promise<DeadlineRecord | null> {
    const isCompleted = data.status === 'COMPLETED';
    const completedAt = isCompleted ? new Date() : undefined;

    if (isMemoryMode()) {
      const record = memoryDeadlines.get(id);
      if (!record || record.companyId !== companyId) return null;
      if (data.status) record.status = data.status;
      if (data.dueAt) record.dueAt = new Date(data.dueAt);
      if (data.title !== undefined) record.title = data.title;
      if (isCompleted) record.completedAt = completedAt || new Date();
      record.updatedAt = new Date();
      memoryDeadlines.set(id, record);
      return record;
    }

    try {
      const existing = await prisma.tenderDeadline.findFirst({
        where: { id, companyId }
      });
      if (!existing) return null;

      const updated = await prisma.tenderDeadline.update({
        where: { id },
        data: {
          ...(data.status ? { status: data.status } : {}),
          ...(data.dueAt ? { dueAt: new Date(data.dueAt) } : {}),
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(isCompleted ? { completedAt: new Date() } : {})
        }
      });
      memoryDeadlines.set(id, updated as any);
      return updated as any;
    } catch (err: any) {
      console.warn('[DeadlineService] DB fallback updateDeadline:', err?.message);
      const record = memoryDeadlines.get(id);
      if (!record || record.companyId !== companyId) return null;
      if (data.status) record.status = data.status;
      if (data.dueAt) record.dueAt = new Date(data.dueAt);
      if (data.title !== undefined) record.title = data.title;
      if (isCompleted) record.completedAt = completedAt || new Date();
      record.updatedAt = new Date();
      memoryDeadlines.set(id, record);
      return record;
    }
  }

  /**
   * Dashboard summary aggregation counts by criticality zones
   */
  static async getDeadlinesSummary(companyId: string): Promise<{
    critical: number;
    soon: number;
    medium: number;
    planned: number;
    totalPending: number;
    missed: number;
    completed: number;
  }> {
    const deadlines = await this.getCompanyDeadlines(companyId);

    const pending = deadlines.filter(d => d.status === 'PENDING');
    const critical = pending.filter(d => d.criticalityZone === 'CRITICAL').length;
    const soon = pending.filter(d => d.criticalityZone === 'SOON').length;
    const medium = pending.filter(d => d.criticalityZone === 'MEDIUM').length;
    const planned = pending.filter(d => d.criticalityZone === 'PLANNED').length;

    let missed = 0;
    let completed = 0;

    if (isMemoryMode()) {
      const allCompany = Array.from(memoryDeadlines.values()).filter(d => d.companyId === companyId);
      missed = allCompany.filter(d => d.status === 'MISSED').length;
      completed = allCompany.filter(d => d.status === 'COMPLETED').length;
    } else {
      try {
        missed = await prisma.tenderDeadline.count({
          where: { companyId, status: 'MISSED' }
        });
        completed = await prisma.tenderDeadline.count({
          where: { companyId, status: 'COMPLETED' }
        });
      } catch {
        const allCompany = Array.from(memoryDeadlines.values()).filter(d => d.companyId === companyId);
        missed = allCompany.filter(d => d.status === 'MISSED').length;
        completed = allCompany.filter(d => d.status === 'COMPLETED').length;
      }
    }

    return {
      critical,
      soon,
      medium,
      planned,
      totalPending: pending.length,
      missed,
      completed
    };
  }

  /**
   * Helper method for test seeding
   */
  static seedMemoryTender(tender: any) {
    memoryTenders.set(tender.id, tender);
  }
}
