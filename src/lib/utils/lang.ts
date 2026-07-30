/**
 * Detects whether input text is written in Kazakh ('kk') or Russian ('ru')
 */
export function detectLanguage(text: string): 'ru' | 'kk' {
  if (!text || typeof text !== 'string') return 'ru';

  const clean = text.toLowerCase().trim();

  // Kazakh specific alphabet characters: ә, ғ, қ, ң, ө, ұ, ү, һ, і
  const kazakhLetterPattern = /[әғқңөұүһі]/i;
  if (kazakhLetterPattern.test(clean)) {
    return 'kk';
  }

  // Common Kazakh query words
  const kazakhWords = [
    'қанша', 'қандай', 'мерзім', 'талаптар', 'кепілдік', 'құжаттар',
    'сомасы', 'тапсырыс', 'беруші', 'мерзімі', 'шарттар', 'келісімшарт'
  ];

  if (kazakhWords.some(word => clean.includes(word))) {
    return 'kk';
  }

  return 'ru';
}
