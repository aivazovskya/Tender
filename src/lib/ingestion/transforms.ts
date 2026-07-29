import { TransformName } from '../types/scraper';

/**
 * TransformRegistry - Registry of reusable data transformations for scraper field extractions.
 */
export class TransformRegistry {
  private static MONTHS_RU: Record<string, string> = {
    'января': '01', 'январь': '01', 'янв': '01',
    'февраля': '02', 'февраль': '02', 'фев': '02',
    'марта': '03', 'март': '03', 'мар': '03',
    'апреля': '04', 'апрель': '04', 'апр': '04',
    'мая': '05', 'май': '05',
    'июня': '06', 'июнь': '06', 'июн': '06',
    'июля': '07', 'июль': '07', 'июл': '07',
    'августа': '08', 'август': '08', 'авг': '08',
    'сентября': '09', 'сентябрь': '09', 'сен': '09',
    'октября': '10', 'октябрь': '10', 'окт': '10',
    'ноября': '11', 'ноябрь': '11', 'ноя': '11',
    'декабря': '12', 'декабрь': '12', 'дек': '12',
  };

  public static apply(value: any, transformName?: TransformName, transformParam?: string, baseUrl?: string): any {
    if (value === null || value === undefined) return '';
    const strVal = String(value);

    if (!transformName) return strVal.trim();

    switch (transformName) {
      case 'trim':
        return TransformRegistry.trim(strVal);
      case 'stripHtml':
        return TransformRegistry.stripHtml(strVal);
      case 'absoluteUrl':
        return TransformRegistry.absoluteUrl(strVal, baseUrl || transformParam);
      case 'parseAmountKzt':
        return TransformRegistry.parseAmountKzt(strVal);
      case 'parseDateRu':
        return TransformRegistry.parseDateRu(strVal);
      case 'parseDateISO':
        return TransformRegistry.parseDateISO(strVal);
      case 'regexExtract':
        return TransformRegistry.regexExtract(strVal, transformParam);
      default:
        return strVal.trim();
    }
  }

  public static trim(val: string): string {
    return val.replace(/\s+/g, ' ').trim();
  }

  public static stripHtml(val: string): string {
    return val.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  public static absoluteUrl(val: string, baseUrl?: string): string {
    const trimmed = val.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    if (!baseUrl) return trimmed;
    try {
      const base = new URL(baseUrl);
      return new URL(trimmed, base.origin).toString();
    } catch {
      return trimmed;
    }
  }

  public static parseAmountKzt(val: string): number {
    if (!val) return 0;
    let normalized = val.toLowerCase().replace(/\s+/g, '').replace(/₸|тг|тенге|kzt/gi, '');
    
    // Check for "млн" or "млрд" multiplier
    let multiplier = 1;
    if (normalized.includes('млн')) {
      multiplier = 1000000;
      normalized = normalized.replace('млн', '');
    } else if (normalized.includes('млрд')) {
      multiplier = 1000000000;
      normalized = normalized.replace('млрд', '');
    } else if (normalized.includes('тыс')) {
      multiplier = 1000;
      normalized = normalized.replace('тыс', '');
    }

    // Replace comma with dot if it's a decimal separator
    normalized = normalized.replace(',', '.');
    const matches = normalized.match(/[\d.]+/);
    if (!matches) return 0;

    const num = parseFloat(matches[0]);
    return isNaN(num) ? 0 : Math.round(num * multiplier * 100) / 100;
  }

  public static parseDateRu(val: string): string {
    if (!val) return new Date().toISOString();
    const clean = val.toLowerCase().replace(/\s+/g, ' ').trim();

    // Check ISO or standard dot format DD.MM.YYYY
    const dotMatch = clean.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dotMatch) {
      const day = dotMatch[1].padStart(2, '0');
      const month = dotMatch[2].padStart(2, '0');
      const year = dotMatch[3];
      return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
    }

    // Check textual Russian date format "25 июля 2026"
    const textMatch = clean.match(/(\d{1,2})\s+([а-яяА-Я]+)\s+(\d{4})/);
    if (textMatch) {
      const day = textMatch[1].padStart(2, '0');
      const monthStr = textMatch[2];
      const month = TransformRegistry.MONTHS_RU[monthStr] || '01';
      const year = textMatch[3];
      return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
    }

    // Fallback: attempt native JS Date parse
    const parsed = Date.parse(clean);
    if (!isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }

    return new Date().toISOString();
  }

  public static parseDateISO(val: string): string {
    if (!val) return new Date().toISOString();
    const parsed = Date.parse(val);
    if (!isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
    return TransformRegistry.parseDateRu(val);
  }

  public static regexExtract(val: string, pattern?: string): string {
    if (!val || !pattern) return val;
    
    // ReDoS Security Protection: limit length and check for catastrophic backtracking signatures
    if (pattern.length > 100) return val;

    // Detect nested quantifiers causing exponential backtracking, e.g. (a+)+, (a*)*, (\w+)+
    const dangerousNestedQuantifiers = /(\([^)]*[\*\+\?][^)]*\))[\*\+\?]/;
    if (dangerousNestedQuantifiers.test(pattern)) {
      console.warn('[ReDoS Guard] Заблокировано регулярное выражение с риском бэктрекинга:', pattern);
      return val;
    }

    const inputVal = val.length > 10000 ? val.substring(0, 10000) : val;

    try {
      const regex = new RegExp(pattern, 'i');
      const match = inputVal.match(regex);
      if (!match) return '';
      return match[1] !== undefined ? match[1] : match[0];
    } catch {
      return val;
    }
  }
}
