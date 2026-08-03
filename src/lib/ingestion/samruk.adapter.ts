import { BaseTenderAdapter, IngestionResult } from './base.adapter';
import { Tender, SourceType, AdapterType } from '../types/tender';

export class SamrukApiAdapter extends BaseTenderAdapter {
  protected sourceType: SourceType = 'SAMRUK_KAZYNA';
  protected adapterType: AdapterType = 'API';
  public usedFallbackData: boolean = false;

  async fetchRawData(): Promise<any[]> {
    const token = process.env.SAMRUK_API_TOKEN;

    if (token && token.trim().length > 0 && !token.includes('your_')) {
      try {
        const res = await fetch('https://portal.sk.kz/api/v1/adverts?limit=10', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });

        if (res.ok) {
          const json = await res.json();
          const items = Array.isArray(json) ? json : json?.data || json?.items;
          if (Array.isArray(items) && items.length > 0) {
            this.usedFallbackData = false;
            return items.map((item: any) => ({
              advertId: item.id || item.advertId,
              advertNumber: item.advertNumber || `SK-${item.id}`,
              titleRu: item.titleRu || item.name,
              organizerRu: item.organizerRu || item.customerName || 'АО "Самрук-Казына"',
              organizerBin: item.organizerBin || item.customerBin || '000000000000',
              sum: Number(item.sum || item.totalSum) || 0,
              regionNameRu: item.regionNameRu || item.region || 'г. Астана',
              publishDate: item.publishDate || new Date().toISOString(),
              endDate: item.endDate || new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
              guaranteeAmount: Math.round((Number(item.sum || item.totalSum) || 0) * 0.01),
              files: Array.isArray(item.files || item.documents || item.attachments)
                ? (item.files || item.documents || item.attachments).map((f: any) => ({
                    name: f.name || f.fileName || 'Спецификация.pdf',
                    url: f.url || f.fileUrl || f.path || '',
                    size: f.size || f.fileSize || '1.5 MB'
                  }))
                : []
            }));
          }
        }
      } catch (err) {
        console.warn('[SamrukApiAdapter] Ошибка соединения с API Самрук-Казына:', err);
      }
    }

    // Fallback/демо-данные при отсутствии токена или ошибки сети
    this.usedFallbackData = true;
    return [
      {
        advertId: 99120,
        advertNumber: 'SK-2026-99120',
        titleRu: 'Услуги по автотранспортному обслуживанию и аренде спецтехники в Павлодарской области',
        organizerRu: 'АО "Павлодарэнерго"',
        organizerBin: '990340000122',
        sum: 67000000.0,
        regionNameRu: 'Павлодарская область',
        publishDate: '2026-07-23T11:30:00Z',
        endDate: '2026-08-11T16:00:00Z',
        guaranteeAmount: 670000.0,
        files: [
          { name: 'Требования_к_технике_Павлодар.pdf', url: '/docs/fleet_req.pdf', size: '2.0 MB' }
        ]
      }
    ];
  }

  normalize(rawData: any[]): Tender[] {
    return rawData.map((raw) => {
      const docs = Array.isArray(raw.files) && raw.files.length > 0
        ? raw.files.map((f: any, idx: number) => {
            const rawUrl = f.url || f.fileUrl || f.path || '';
            const fileUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('/')
              ? rawUrl
              : `https://portal.sk.kz${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
            return {
              id: `doc-sk-${raw.advertId}-${idx + 1}`,
              fileName: f.name || 'Техническая_спецификация.pdf',
              fileUrl,
              fileSize: f.size || '1.5 MB',
              docType: 'TECHNICAL_SPEC'
            };
          })
        : [
            { id: `doc-sk-${raw.advertId}`, fileName: 'Требования_к_технике_Павлодар.pdf', fileUrl: '/docs/fleet_req.pdf', fileSize: '2.0 MB', fileType: 'pdf' }
          ];

      return {
        id: `sk-${raw.advertId}`,
        source: 'SAMRUK_KAZYNA',
        externalId: raw.advertNumber,
        title: raw.titleRu,
        description: 'Импортировано из портала закупок АО ФНБ "Самрук-Казына" (portal.sk.kz).',
        customerName: raw.organizerRu,
        customerBin: raw.organizerBin,
        category: 'Транспорт и Логистика',
        industryTags: ['Аренда авто', 'Спецтехника', 'Энергетика'],
        procurementMethod: 'OPEN_TENDER',
        amount: raw.sum,
        currency: 'KZT',
        region: raw.regionNameRu,
        publishDate: raw.publish_date || raw.publishDate,
        deadlineDate: raw.endDate,
        applicationSecurityAmount: raw.guaranteeAmount,
        applicationSecurityPercent: 1,
        status: 'ACTIVE',
        sourceUrl: `https://portal.sk.kz/tender/${raw.advertId}`,
        aiSummary: 'Аренда спецтехники и транспортное обслуживание в Павлодаре. Необходим парк авто не старше 2020 года.',
        aiKeyRequirements: ['Наличие собственного автопарка спецтехники', 'Страхование ГПО'],
        riskScore: 30,
        riskScoringStatus: 'DEFAULT_ADAPTER',
        riskFlags: [
          {
            id: `rf-sk-${raw.advertId}`,
            code: 'FLEET_AGE_RESTRICTION',
            severity: 'MEDIUM',
            title: 'Ограничение по возрасту техники',
            description: 'Год выпуска техники не ранее 2020 г. Проверьте свой баланс перед подачей.'
          }
        ],
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
      result.message = `⚠️ Использованы демонстрационные данные — токен SAMRUK_API_TOKEN отсутствует или недействителен`;
    }
    return result;
  }
}
