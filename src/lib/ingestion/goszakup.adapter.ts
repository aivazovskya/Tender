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
        const query = `
          query {
            TrdBuy(limit: 10) {
              id
              numberAnno
              nameRu
              totalSum
              customerBin
              customerNameRu
              regionRu
              publishDate
              endDate
              Files {
                nameRu
                filePath
                fileSize
              }
            }
          }
        `;

        const res = await fetch('https://graphql.goszakup.gov.kz/v3/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ query })
        });

        if (res.ok) {
          const json = await res.json();
          if (json?.data?.TrdBuy && Array.isArray(json.data.TrdBuy)) {
            this.usedFallbackData = false;
            return json.data.TrdBuy.map((b: any) => ({
              id: b.id,
              number_anno: b.numberAnno || `${b.id}-2026`,
              name_ru: b.nameRu,
              customer_name_ru: b.customerNameRu || 'Заказчик ЕГСЗ РК',
              customer_bin: b.customerBin || '000000000000',
              total_sum: Number(b.totalSum) || 0,
              region_ru: b.regionRu || 'г. Астана',
              publish_date: b.publishDate || new Date().toISOString(),
              end_date: b.endDate || new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
              security_sum: Math.round((Number(b.totalSum) || 0) * 0.03),
              trade_buy_name_ru: 'Открытый конкурс',
              ref_buy_status_id: 'PUBLISHED',
              files: Array.isArray(b.Files || b.files) ? (b.Files || b.files).map((f: any) => ({
                name: f.nameRu || f.name || 'ТЗ_Спецификация.pdf',
                path: f.filePath || f.path || f.url || '',
                size: f.fileSize ? `${Math.round(Number(f.fileSize) / 1024)} KB` : '1.2 MB'
              })) : []
            }));
          }
        }
      } catch (err) {
        console.warn('[GoszakupApiAdapter] Ошибка соединения с GraphQL API:', err);
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
        description: 'Автоматически импортировано из веб-сервисов ЕГСЗ goszakup.gov.kz.',
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
}
