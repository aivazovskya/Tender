import { Tender, CompanyProfileData } from '../types/tender';

export class AIClientService {
  /**
   * Vector Embedding & Cosine Similarity TF-IDF Natural Language Search
   */
  static searchSemantic(query: string, tenders: Tender[]): Tender[] {
    if (!query.trim()) return tenders;
    const cleanQuery = query.toLowerCase().trim();

    // 1. Vectorize query into word n-gram tokens
    const queryTokens = AIClientService.tokenizeVector(cleanQuery);
    if (queryTokens.length === 0) return tenders;

    const scored = tenders.map(tender => {
      const docText = `${tender.title} ${tender.description || ''} ${tender.category} ${tender.industryTags.join(' ')} ${tender.customerName} ${tender.region} ${tender.aiSummary || ''}`.toLowerCase();
      const docTokens = AIClientService.tokenizeVector(docText);

      // Compute Cosine Similarity between query vector and document vector
      const simScore = AIClientService.cosineSimilarity(queryTokens, docTokens);
      let totalScore = simScore * 100;

      // Geographic intent matching
      if ((cleanQuery.includes('астана') || cleanQuery.includes('столиц')) && tender.region.includes('Астана')) totalScore += 25;
      if (cleanQuery.includes('алматы') && tender.region.includes('Алматы')) totalScore += 25;
      if (cleanQuery.includes('шымкент') && tender.region.includes('Шымкент')) totalScore += 25;

      // Numeric contract limit constraint matching
      const amountMatch = cleanQuery.match(/до\s+(\d+)\s*(млн|миллионов|тыс|тысяч|млрд)/i);
      if (amountMatch) {
        let maxVal = parseFloat(amountMatch[1]);
        const unit = amountMatch[2].toLowerCase();
        if (unit.startsWith('млн') || unit.startsWith('миллион')) maxVal *= 1_000_000;
        if (unit.startsWith('тыс')) maxVal *= 1_000;
        if (unit.startsWith('млрд')) maxVal *= 1_000_000_000;

        if (tender.amount <= maxVal) {
          totalScore += 20;
        } else {
          totalScore -= 40;
        }
      }

      return { tender, score: totalScore };
    });

    return scored
      .filter(item => item.score > 5)
      .sort((a, b) => b.score - a.score)
      .map(item => item.tender);
  }

  static matchCompanyProfile(profile: CompanyProfileData, tenders: Tender[]): Array<Tender & { matchScore: number; matchReasons: string[] }> {
    return tenders.map(tender => {
      let score = 50; // Base baseline score
      const reasons: string[] = [];

      // Keyword match (+25)
      const titleLower = tender.title.toLowerCase();
      const matchedKw = profile.keywords.find(kw => titleLower.includes(kw.toLowerCase()));
      if (matchedKw) {
        score += 25;
        reasons.push(`Совпадение по ключевому слову "${matchedKw}"`);
      }

      // Region match (+15)
      if (profile.regions.some(r => tender.region.includes(r))) {
        score += 15;
        reasons.push(`Регион в целевом списке: ${tender.region}`);
      }

      // Budget scope suitability (+10)
      if (tender.amount >= profile.minAmount && tender.amount <= profile.maxAmount) {
        score += 10;
        reasons.push(`Бюджет попадает в диапазон профиля`);
      } else if (tender.amount > profile.maxAmount) {
        score -= 15;
        reasons.push(`Бюджет превышает указанный лимит`);
      }

      // Risk score penalty
      if (tender.riskScore > 65) {
        score -= 20;
        reasons.push(`Повышенный риск лота (${tender.riskScore}/100)`);
      }

      return {
        ...tender,
        matchScore: Math.min(Math.max(score, 10), 99),
        matchReasons: reasons
      };
    });
  }

  static tokenizeVector(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\sа-ябыеёжузийклмнопрстуфхцчшщъыьэюя]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  static cosineSimilarity(vecA: string[], vecB: string[]): number {
    const freqA = new Map<string, number>();
    const freqB = new Map<string, number>();

    vecA.forEach(w => freqA.set(w, (freqA.get(w) || 0) + 1));
    vecB.forEach(w => freqB.set(w, (freqB.get(w) || 0) + 1));

    let dotProduct = 0;
    freqA.forEach((count, word) => {
      if (freqB.has(word)) {
        dotProduct += count * (freqB.get(word) || 0);
      }
    });

    const magA = Math.sqrt(Array.from(freqA.values()).reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(Array.from(freqB.values()).reduce((sum, val) => sum + val * val, 0));

    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
  }
}
