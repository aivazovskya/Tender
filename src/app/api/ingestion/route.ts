import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiAdapter } from '@/lib/ingestion/adapter-registry';
import { ConfigurableScraperAdapter } from '@/lib/ingestion/scraper.adapter';
import { ScraperSourceConfigData } from '@/lib/types/scraper';
import { validateApiAuth } from '@/lib/security/auth';
import { IngestionProcessorService } from '@/lib/services/ingestion-processor.service';

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

    const apiAdapter = getApiAdapter(source);
    if (apiAdapter) {
      result = await apiAdapter.run();
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

    // Persist normalized tenders into PostgreSQL database via unified IngestionProcessorService
    if (result && result.status !== 'ERROR' && Array.isArray(result.tenders) && result.tenders.length > 0) {
      await IngestionProcessorService.processIngestedTenders(result.tenders);
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

