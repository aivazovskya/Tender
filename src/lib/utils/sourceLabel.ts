export interface DataSourceMeta {
  id: string;
  name?: string;
  displayName?: string;
}

/**
 * Returns a human-readable label for a tender source.
 * Handles GOSZAKUP, SAMRUK_KAZYNA, KAZATMROPROM, and dynamic SCRAPER:<id> sources.
 */
export function getSourceLabel(source: string, dataSources?: DataSourceMeta[]): string {
  if (!source) return 'Неизвестный источник';
  if (source === 'GOSZAKUP') return 'goszakup.gov.kz';
  if (source === 'SAMRUK_KAZYNA') return 'portal.sk.kz';
  if (source === 'KAZATMROPROM') return 'kazatomprom.kz';
  if (source === 'B2B_PRIVATE') return 'Частная площадка (B2B)';

  if (source.startsWith('SCRAPER:')) {
    const scraperIdOrName = source.replace('SCRAPER:', '').trim();
    if (dataSources && dataSources.length > 0) {
      const found = dataSources.find(
        d => d.id === scraperIdOrName || d.name === scraperIdOrName || d.displayName === scraperIdOrName
      );
      if (found && found.displayName) {
        return found.displayName;
      }
    }
    return scraperIdOrName || 'Частная площадка (B2B)';
  }

  return source;
}

/**
 * Returns a short badge abbreviation for Kanban cards (e.g. ГОС, СК, B2B).
 */
export function getShortSourceBadge(source: string, dataSources?: DataSourceMeta[]): string {
  if (source === 'GOSZAKUP') return 'ГОС';
  if (source === 'SAMRUK_KAZYNA') return 'СК';
  if (source === 'KAZATMROPROM') return 'КАП';

  if (source.startsWith('SCRAPER:')) {
    const scraperIdOrName = source.replace('SCRAPER:', '').trim();
    if (dataSources && dataSources.length > 0) {
      const found = dataSources.find(
        d => d.id === scraperIdOrName || d.name === scraperIdOrName
      );
      if (found && found.displayName) {
        const words = found.displayName.split(/\s+/).filter(Boolean);
        const initials = words.map(w => w[0]).join('').toUpperCase();
        return initials.length > 0 && initials.length <= 4 ? initials : 'B2B';
      }
    }
    return 'B2B';
  }

  return 'B2B';
}
