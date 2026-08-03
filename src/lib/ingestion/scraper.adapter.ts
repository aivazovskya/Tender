import * as cheerio from 'cheerio';
import { BaseTenderAdapter, IngestionResult } from './base.adapter';
import { Tender, SourceType, AdapterType } from '../types/tender';
import { ScraperSourceConfigData, FieldExtractionRule } from '../types/scraper';
import { TransformRegistry } from './transforms';
import { RobotsTxtChecker } from './robots';
import { validateUrlForSSRF } from '../security/ssrf';

export class ConfigurableScraperAdapter extends BaseTenderAdapter {
  protected sourceType: SourceType = 'B2B_PRIVATE';
  protected adapterType: AdapterType = 'SCRAPER';
  private config: ScraperSourceConfigData;
  public lastSelectorWarnings: string[] = [];

  constructor(config: ScraperSourceConfigData) {
    super();
    this.config = config;
    const dsId = config.dataSourceId || 'CUSTOM_SCRAPER';
    this.sourceType = dsId.startsWith('SCRAPER:') ? dsId : `SCRAPER:${dsId}`;
  }

  async fetchRawData(): Promise<any[]> {
    this.lastSelectorWarnings = [];
    const rawItems: any[] = [];
    const {
      listUrlTemplate,
      pagination,
      listItemSelector,
      fields,
      detailPage,
      renderMode,
      respectRobotsTxt = true
    } = this.config;

    const startPage = pagination?.startPage || 1;
    const maxPages = pagination?.maxPages || 5;
    const stopOnEmpty = pagination?.stopOnEmpty !== false;

    let browser: any = null;

    try {
      if (renderMode === 'JS_RENDERED') {
        const playwright = require('playwright');
        browser = await playwright.chromium.launch({ headless: true });
      }

      for (let page = startPage; page < startPage + maxPages; page++) {
        const targetUrl = listUrlTemplate.replace('{page}', String(page));

        // SSRF Security Check
        const ssrfCheck = validateUrlForSSRF(targetUrl);
        if (!ssrfCheck.allowed) {
          const ssrfWarning = `Запрос к ${targetUrl} заблокирован фильтром SSRF: ${ssrfCheck.reason}`;
          console.warn(`[ConfigurableScraperAdapter] ${ssrfWarning}`);
          this.lastSelectorWarnings.push(ssrfWarning);
          break;
        }

        // Check robots.txt
        if (respectRobotsTxt) {
          const isAllowed = await RobotsTxtChecker.isAllowed(targetUrl);
          if (!isAllowed) {
            this.lastSelectorWarnings.push(`Доступ к ${targetUrl} заблокирован директивой robots.txt`);
            break;
          }
        }

        let html = '';
        if (renderMode === 'JS_RENDERED' && browser) {
          html = await this.rateLimiter.executeWithBackoff(async () => {
            const context = await browser.newContext({
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            const pageObj = await context.newPage();
            await pageObj.goto(targetUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
            if (listItemSelector) {
              await pageObj.waitForSelector(listItemSelector, { timeout: 5000 }).catch(() => {});
            }
            const content = await pageObj.content();
            await context.close();
            return content;
          });
        } else {
          // STATIC mode fetch
          html = await this.rateLimiter.executeWithBackoff(async () => {
            const res = await fetch(targetUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            if (!res.ok) {
              throw new Error(`HTTP Error ${res.status} when fetching ${targetUrl}`);
            }
            return await res.text();
          });
        }

        if (!html) break;

        const $ = cheerio.load(html);
        const cardElements = $(listItemSelector);

        if (cardElements.length === 0) {
          const warningMsg = `Селектор списка '${listItemSelector}' не нашел элементов на странице ${targetUrl}`;
          console.warn(`[ConfigurableScraperAdapter] ${warningMsg}`);
          this.lastSelectorWarnings.push(warningMsg);
          if (stopOnEmpty) break;
        }

        // Process each card
        for (let i = 0; i < cardElements.length; i++) {
          const card = cardElements.eq(i);
          const rawItem: Record<string, any> = { _pageUrl: targetUrl };

          // Extract list fields
          for (const [fieldName, rule] of Object.entries(fields)) {
            rawItem[fieldName] = this.extractFieldValue($, card, rule, targetUrl);
          }

          // Extract detail page fields if enabled and detailUrl is present
          if (detailPage?.enabled && detailPage.fields && rawItem.detailUrl) {
            try {
              const detailUrl = TransformRegistry.absoluteUrl(rawItem.detailUrl, targetUrl);
              const detailSsrf = validateUrlForSSRF(detailUrl);
              if (detailSsrf.allowed) {
                const detailHtml = await this.fetchDetailPageHtml(detailUrl, renderMode, browser);
                if (detailHtml) {
                  const $detail = cheerio.load(detailHtml);
                  for (const [fieldName, rule] of Object.entries(detailPage.fields)) {
                    rawItem[fieldName] = this.extractFieldValue($detail, $detail('body'), rule, detailUrl);
                  }
                }
              } else {
                console.warn(`[ConfigurableScraperAdapter] SSRF заблокировал загрузку детальной страницы ${detailUrl}: ${detailSsrf.reason}`);
              }
            } catch (err: any) {
              console.warn(`[ConfigurableScraperAdapter] Ошибка загрузки детальной страницы лота: ${err?.message}`);
            }
          }

          rawItems.push(rawItem);
        }
      }
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }

    return rawItems;
  }

  private extractFieldValue($: cheerio.CheerioAPI, contextElem: cheerio.Cheerio<any>, rule: FieldExtractionRule, baseUrl: string): string {
    const target = rule.selector ? contextElem.find(rule.selector) : contextElem;
    if (target.length === 0) return '';

    let rawVal = '';
    const attr = rule.attr || 'text';
    if (attr === 'text') {
      rawVal = target.text();
    } else if (attr === 'html') {
      rawVal = target.html() || '';
    } else {
      rawVal = target.attr(attr) || '';
    }

    return TransformRegistry.apply(rawVal, rule.transform, rule.transformParam, baseUrl);
  }

  private async fetchDetailPageHtml(url: string, renderMode: string, browser: any): Promise<string> {
    if (renderMode === 'JS_RENDERED' && browser) {
      return await this.rateLimiter.executeWithBackoff(async () => {
        const context = await browser.newContext();
        const pageObj = await context.newPage();
        await pageObj.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const content = await pageObj.content();
        await context.close();
        return content;
      });
    } else {
      return await this.rateLimiter.executeWithBackoff(async () => {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        return await res.text();
      });
    }
  }

  normalize(rawData: any[]): Tender[] {
    return rawData.map((item, idx) => {
      const extId = item.externalId || item.id || `SCRAPER-${Date.now()}-${idx + 1}`;
      const title = item.title || item.name || 'Закупка без названия';
      const amount = typeof item.amount === 'number' ? item.amount : TransformRegistry.parseAmountKzt(String(item.amount || 0));
      const sourceUrl = item.detailUrl ? TransformRegistry.absoluteUrl(item.detailUrl, item._pageUrl) : item._pageUrl || this.config.listUrlTemplate;

      return {
        id: `t-scraper-${extId}`,
        source: this.sourceType,
        externalId: String(extId),
        title: String(title),
        description: item.description ? String(item.description) : undefined,
        customerName: item.customerName || item.customer || 'Частный заказчик',
        customerBin: item.customerBin || item.bin || '000000000000',
        category: item.category || 'Коммерческие закупки',
        industryTags: Array.isArray(item.industryTags) ? item.industryTags : (item.category ? [item.category] : ['B2B']),
        procurementMethod: 'OPEN_TENDER',
        amount,
        currency: 'KZT',
        region: item.region || 'Республика Казахстан',
        publishDate: item.publishDate ? TransformRegistry.parseDateISO(item.publishDate) : new Date().toISOString(),
        deadlineDate: item.deadlineDate ? TransformRegistry.parseDateISO(item.deadlineDate) : new Date(Date.now() + 7 * 86400000).toISOString(),
        status: item.status || 'ACTIVE',
        sourceUrl,
        riskScore: item.riskScore || 10,
        riskScoringStatus: 'DEFAULT_ADAPTER',
        riskFlags: [],
        documents: [],
        history: []
      };
    });
  }

  override async run(): Promise<IngestionResult> {
    const result = await super.run();
    if (this.lastSelectorWarnings.length > 0) {
      result.status = 'WARN';
      result.message = `${result.message}. Предупреждение деградации селекторов: ${this.lastSelectorWarnings.join('; ')}`;
    }
    return result;
  }
}
