import { NextRequest, NextResponse } from 'next/server';
import { ConfigurableScraperAdapter } from '@/lib/ingestion/scraper.adapter';
import { ScraperSourceConfigData } from '@/lib/types/scraper';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await request.json();
    const {
      listUrlTemplate,
      renderMode = 'STATIC',
      listItemSelector,
      fields,
      detailPage,
      respectRobotsTxt = true
    } = body;

    if (!listUrlTemplate || !listItemSelector || !fields) {
      return NextResponse.json({
        success: false,
        error: 'Необходимо заполнить URL шаблона, CSS-селектор элемента списка и словарь полей'
      }, { status: 400 });
    }

    const testConfig: ScraperSourceConfigData = {
      dataSourceId: 'TEST-PREVIEW',
      renderMode,
      listUrlTemplate,
      pagination: { startPage: 1, maxPages: 1, stopOnEmpty: true },
      listItemSelector,
      fields,
      detailPage,
      respectRobotsTxt,
      active: true
    };

    const adapter = new ConfigurableScraperAdapter(testConfig);
    const result = await adapter.run();

    const sampleTenders = (result.tenders || []).slice(0, 3);
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: result.status !== 'ERROR',
      itemsFound: result.itemsFetched,
      durationMs,
      warnings: adapter.lastSelectorWarnings,
      sampleTenders,
      message: result.message,
      error: result.status === 'ERROR' ? result.message : undefined
    });
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    return NextResponse.json({
      success: false,
      itemsFound: 0,
      durationMs,
      warnings: [],
      sampleTenders: [],
      error: error?.message || 'Сбой выполнения пробного обхода'
    }, { status: 500 });
  }
}
