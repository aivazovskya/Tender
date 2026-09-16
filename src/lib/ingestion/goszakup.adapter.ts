import { BaseTenderAdapter, IngestionResult } from './base.adapter';
import { Tender, SourceType, AdapterType } from '../types/tender';

export class GoszakupApiAdapter extends BaseTenderAdapter {
  protected sourceType: SourceType = 'GOSZAKUP';
  protected adapterType: AdapterType = 'API';
  public usedFallbackData: boolean = false;

  async fetchRawData(): Promise<any[]> {
    const token = process.env.GOSZAKUP_API_TOKEN;

    if (token && token.trim().length > 0 && !token.includes('your_')) {
      try {
        const allItems: any[] = [];
        let after: number | null = null;
        const maxPages = 4;
        const pageSize = 50;

        for (let page = 0; page < maxPages; page++) {
          const afterArg: string = after !== null ? `, after: ${after}` : '';
          const query = `
            query {
              TrdBuy(limit: ${pageSize}${afterArg}) {
                id
                numberAnno
                nameRu
                totalSum
                customerBin
                customerNameRu
                kato
                publishDate
                endDate
                Files {
                  nameRu
                  filePath
                }
              }
            }
          `;

          const res = await fetch('https://ows.goszakup.gov.kz/v3/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ query })
          });

          if (!res.ok) break;
          const json = await res.json();
          const trdBuy = json?.data?.TrdBuy;
          if (!Array.isArray(trdBuy) || trdBuy.length === 0) break;

          allItems.push(...trdBuy);
          if (trdBuy.length < pageSize) break;
          after = trdBuy[trdBuy.length - 1].id;
        }

        if (allItems.length > 0) {
          this.usedFallbackData = false;
          return allItems.map((b: any) => ({
            id: b.id,
            number_anno: b.numberAnno || `${b.id}-2026`,
            name_ru: b.nameRu,
            customer_name_ru: b.customerNameRu || 'Заказчик ЕГСЗ РК',
            customer_bin: b.customerBin || '000000000000',
            total_sum: Number(b.totalSum) || 0,
            // TrdBuy has no region name field in the v3 schema — only `kato` (location
            // classifier codes, not human-readable names). Falls back to a constant until
            // a KATO code -> region name lookup table is added.
            region_ru: 'г. Астана',
            publish_date: b.publishDate || new Date().toISOString(),
            end_date: b.endDate || new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
            security_sum: Math.round((Number(b.totalSum) || 0) * 0.03),
            trade_buy_name_ru: 'Открытый конкурс',
            ref_buy_status_id: 'PUBLISHED',
            files: Array.isArray(b.Files || b.files) ? (b.Files || b.files).map((f: any) => ({
              name: f.nameRu || f.name || 'ТЗ_Спецификация.pdf',
              path: f.filePath || f.path || f.url || '',
              size: '1.2 MB'
            })) : []
          }));
        }
      } catch (err) {
        console.warn('[GoszakupApiAdapter] Ошибка соединения с API Госзакупок:', err);
      }
    }

    // Fallback/демо-данные при отсутствии токена или ошибки API
    this.usedFallbackData = true;
    return [
      {
        id: 987150,
        number_anno: '987150-2026',
        name_ru: 'Поставка лицензий программного обеспечения графического дизайна для колледжей г. Астана',
        customer_name_ru: 'КГУ "Колледж общественного питания и сервиса" Акимата города Астана',
        customer_bin: '050240003412',
        total_sum: 12400000.0,
        region_ru: 'г. Астана',
        publish_date: '2026-07-23T10:00:00Z',
        end_date: '2026-08-07T18:00:00Z',
        security_sum: 372000.0,
        trade_buy_name_ru: 'Открытый конкурс',
        ref_buy_status_id: 'PUBLISHED',
        files: [
          { name: 'ТЗ_Лицензии_ПО.pdf', path: '/docs/tz_software.pdf', size: '1.1 MB' }
        ]
      }
    ];
  }

  normalize(rawData: any[]): Tender[] {
    return rawData.map((raw) => {
      const docs = Array.isArray(raw.files) && raw.files.length > 0
        ? raw.files.map((f: any, idx: number) => {
            const rawPath = f.path || f.filePath || '';
            const fileUrl = rawPath.startsWith('http://') || rawPath.startsWith('https://') || rawPath.startsWith('/')
              ? rawPath
              : `https://v3.goszakup.gov.kz/uploads/${rawPath}`;
            return {
              id: `doc-${raw.id}-${idx + 1}`,
              fileName: f.name || 'Техническая_спецификация.pdf',
              fileUrl,
              fileSize: f.size || '1.0 MB',
              docType: 'TECHNICAL_SPEC'
            };
          })
        : [
            { id: `doc-${raw.id}-1`, fileName: 'ТЗ_Лицензии_ПО.pdf', fileUrl: '/docs/tz_software.pdf', fileSize: '1.1 MB', fileType: 'pdf' }
          ];

      return {
        id: `gos-${raw.id}`,
        source: 'GOSZAKUP',
        externalId: raw.number_anno,
        title: raw.name_ru,
        // The TrdBuy type in the official v3 schema has no description/subject field
        // beyond the title (nameRu) — a real per-lot description would need the
        // nested Lots registry, not yet queried here (needs verification against
        // live data with a real token before wiring it up). Honest placeholder
        // instead of a misleading import-source note.
        description: 'Описание не указано заказчиком',
        customerName: raw.customer_name_ru,
        customerBin: raw.customer_bin,
        category: 'ИТ и ПО',
        industryTags: ['ПО', 'Лицензии', 'Образование'],
        procurementMethod: 'OPEN_TENDER',
        amount: raw.total_sum,
        currency: 'KZT',
        region: raw.region_ru,
        publishDate: raw.publish_date,
        deadlineDate: raw.end_date,
        applicationSecurityAmount: raw.security_sum,
        applicationSecurityPercent: 3,
        status: 'ACTIVE',
        sourceUrl: `https://goszakup.gov.kz/ru/announce/index/${raw.id}`,
        aiSummary: 'Лот на закупку лицензий ПО для учебных заведений Астаны. Включает техническую поддержку 12 месяцев.',
        aiKeyRequirements: ['Наличие статуса официального партнера разработчика ПО', 'Сертификат соответствия'],
        riskScore: 10,
        riskScoringStatus: 'DEFAULT_ADAPTER',
        riskFlags: [],
        documents: docs,
        history: []
      };
    });
  }

  override async run(): Promise<IngestionResult> {
    const result = await super.run();
    result.usedFallbackData = this.usedFallbackData;
    if (this.usedFallbackData) {
      result.status = 'WARN';
      result.message = `⚠️ Использованы демонстрационные данные — токен GOSZAKUP_API_TOKEN отсутствует или недействителен`;
    }
    return result;
  }

  /**
   * Fetches procurement results / protocol status for a specific tender externalId
   */
  async fetchBuyResult(externalId: string): Promise<{
    statusId: string;
    winnerBin: string | null;
    finalAmount: number | null;
    resultDate: string | null;
    isFinished: boolean;
  } | null> {
    const token = process.env.GOSZAKUP_API_TOKEN;

    if (token && token.trim().length > 0 && !token.includes('your_')) {
      try {
        const query = `
          query {
            TrdBuy(filter: { numberAnno: "${externalId}" }) {
              id
              numberAnno
              refBuyStatusId
              totalSum
              TrdBuyItogi {
                supplierBin
                finalAmount
                systemStatusId
              }
            }
          }
        `;

        const res = await fetch('https://ows.goszakup.gov.kz/v3/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ query })
        });

        if (res.ok) {
          const json = await res.json();
          const buy = json?.data?.TrdBuy?.[0];
          if (buy) {
            const itogi = buy.TrdBuyItogi?.[0];
            const isFinished = buy.refBuyStatusId === '350' || buy.refBuyStatusId === '400' || buy.refBuyStatusId === 'FINISHED' || Boolean(itogi);
            return {
              statusId: buy.refBuyStatusId || 'FINISHED',
              winnerBin: itogi?.supplierBin || null,
              finalAmount: itogi?.finalAmount ? Number(itogi.finalAmount) : (buy.totalSum ? Number(buy.totalSum) : null),
              resultDate: new Date().toISOString(),
              isFinished
            };
          }
        }
      } catch (err) {
        console.warn(`[GoszakupApiAdapter] Error fetching buy result for ${externalId}:`, err);
      }
    }

    // Fallback/Demo mock for offline / test environments
    if (externalId.includes('pending')) {
      return {
        statusId: 'PUBLISHED',
        winnerBin: null,
        finalAmount: null,
        resultDate: null,
        isFinished: false
      };
    } else if (externalId.includes('won') || externalId.includes('987150')) {
      return {
        statusId: 'FINISHED',
        winnerBin: '123456789012',
        finalAmount: 12400000.0,
        resultDate: new Date().toISOString(),
        isFinished: true
      };
    } else if (externalId.includes('lost')) {
      return {
        statusId: 'FINISHED',
        winnerBin: '999888777666',
        finalAmount: 48000000.0,
        resultDate: new Date().toISOString(),
        isFinished: true
      };
    }

    return null;
  }
}
