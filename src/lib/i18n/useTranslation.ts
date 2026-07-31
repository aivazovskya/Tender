import { translations } from './translations';

export function useTranslation(language: 'RU' | 'KK') {
  return translations[language] || translations.RU;
}
