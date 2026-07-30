import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GoszakupApiAdapter } from '@/lib/ingestion/goszakup.adapter';
import { SamrukApiAdapter } from '@/lib/ingestion/samruk.adapter';
import { ConfigurableScraperAdapter } from '@/lib/ingestion/scraper.adapter';
import { ScraperSourceConfigData } from '@/lib/types/scraper';
import { AIService } from '@/lib/services/ai.service';
import { validateApiAuth } from '@/lib/security/auth';
import { diffTenderFields } from '@/lib/ingestion/diff';



export async function POST(request: NextRequest) {
  const auth = validateApiAuth(request, 'ADMIN');
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const body = await request.json();
    const { source } = body;

    let result: any;
    let dbSource = await prisma.dataSource.findFirst({
      where: {
        OR: [
          { name: source },
          { id: source }
        ]
      },
      include: {
        scraperConfig: true
      }
    });

    if (source === 'GOSZAKUP') {
      const adapter = new GoszakupApiAdapter();
      result = await adapter.run();
    } else if (source === 'SAMRUK_KAZYNA') {
      const adapter = new SamrukApiAdapter();
      result = await adapter.run();
    } else if (dbSource && dbSource.adapterType === 'SCRAPER' && dbSource.scraperConfig) {
      const configData: ScraperSourceConfigData = {
        dataSourceId: dbSource.name || dbSource.id,
        renderMode: dbSource.scraperConfig.renderMode as any,
        listUrlTemplate: dbSource.scraperConfig.listUrlTemplate,
        pagination: dbSource.scraperConfig.pagination as any,
        listItemSelector: dbSource.scraperConfig.listItemSelector,
        fields: dbSource.scraperConfig.fields as any,
        detailPage: dbSource.scraperConfig.detailPage as any,
        respectRobotsTxt: dbSource.scraperConfig.respectRobotsTxt,
        active: dbSource.scraperConfig.active
      };
      const adapter = new ConfigurableScraperAdapter(configData);
      result = await adapter.run();
    } else {
      return NextResponse.json({ success: false, message: `Источник '${source}' не найден или конфигурация не задана` }, { status: 400 });
    }

    // Persist normalized tenders into PostgreSQL database via Prisma upsert & TenderAuditTrail
    if (result && result.status !== 'ERROR' && Array.isArray(result.tenders) && result.tenders.length > 0) {
      for (const t of result.tenders) {
        let aiSummary = t.aiSummary;
        let aiKeyRequirements = t.aiKeyRequirements || [];
        let riskScore = t.riskScore || 0;

        try {
          const aiAnalysis = await AIService.generateLLMSummary(t);
          if (aiAnalysis) {
            aiSummary = aiAnalysis.summary;
            aiKeyRequirements = aiAnalysis.requirements;
            riskScore = aiAnalysis.riskScore;
          }
        } catch (aiErr) {
          console.warn(`[Ingestion API] Не удалось сгенерировать AI-суммаризацию для лота #${t.externalId}:`, aiErr);
        }

        const existing = await prisma.tender.findUnique({
          where: {
            source_externalId: {
              source: t.source,
              externalId: t.externalId
            }
          }
        });

        let auditLogsToCreate: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
        if (existing) {
          auditLogsToCreate = diffTenderFields(existing, t);
        }

        const savedTender = await prisma.tender.upsert({
          where: {
            source_externalId: {
              source: t.source,
              externalId: t.externalId
            }
          },
          update: {
            title: t.title,
            description: t.description || '',
            customerName: t.customerName,
            customerBin: t.customerBin,
            category: t.category,
            industryTags: t.industryTags || [],
            amount: t.amount,
            currency: t.currency || 'KZT',
            region: t.region,
            publishDate: new Date(t.publishDate),
            deadlineDate: new Date(t.deadlineDate),
            applicationSecurityAmount: t.applicationSecurityAmount,
            applicationSecurityPercent: t.applicationSecurityPercent,
            sourceUrl: t.sourceUrl,
            aiSummary,
            aiKeyRequirements,
            riskScore
          },
          create: {
            source: t.source,
            externalId: t.externalId,
            title: t.title,
            description: t.description || '',
            customerName: t.customerName,
            customerBin: t.customerBin,
            category: t.category,
            industryTags: t.industryTags || [],
            amount: t.amount,
            currency: t.currency || 'KZT',
            region: t.region,
            publishDate: new Date(t.publishDate),
            deadlineDate: new Date(t.deadlineDate),
            applicationSecurityAmount: t.applicationSecurityAmount,
            applicationSecurityPercent: t.applicationSecurityPercent,
            sourceUrl: t.sourceUrl,
            aiSummary,
            aiKeyRequirements,
            riskScore
          }
        });

        if (existing && auditLogsToCreate.length > 0) {
          await prisma.tenderAuditTrail.createMany({
            data: auditLogsToCreate.map(change => ({
              tenderId: savedTender.id,
              field: change.field,
              oldValue: change.oldValue,
              newValue: change.newValue,
              changedBy: 'System Parser'
            }))
          });
        }
      }
    }

    // Log connector execution metrics in database
    try {
      if (dbSource) {
        const healthStatus = result.status === 'ERROR'
          ? 'DOWN'
          : (result.status === 'WARN' || result.usedFallbackData ? 'DEGRADED' : 'HEALTHY');

        await prisma.connectorLog.create({
          data: {
            sourceId: dbSource.id,
            status: result.status,
            message: result.message,
            itemsFetched: result.itemsFetched,
            executionMs: result.durationMs
          }
        });
        await prisma.dataSource.update({
          where: { id: dbSource.id },
          data: {
            lastSyncAt: new Date(),
            totalIngested: { increment: result.itemsFetched },
            healthStatus
          }
        });
      }
    } catch {
      // Non-blocking log persistence failure
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error?.message || 'Сбой выполнения' }, { status: 500 });
  }
}

