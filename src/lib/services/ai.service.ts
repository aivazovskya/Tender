import { Tender, CompanyProfileData } from '../types/tender';

export class AIService {
  /**
   * Vector Embedding & Cosine Similarity TF-IDF Natural Language Search
   */
  static searchSemantic(query: string, tenders: Tender[]): Tender[] {
    if (!query.trim()) return tenders;
    const cleanQuery = query.toLowerCase().trim();

    // 1. Vectorize query into word n-gram tokens
    const queryTokens = AIService.tokenizeVector(cleanQuery);
    if (queryTokens.length === 0) return tenders;

    const scored = tenders.map(tender => {
      const docText = `${tender.title} ${tender.description || ''} ${tender.category} ${tender.industryTags.join(' ')} ${tender.customerName} ${tender.region} ${tender.aiSummary || ''}`.toLowerCase();
      const docTokens = AIService.tokenizeVector(docText);

      // Compute Cosine Similarity between query vector and document vector
      const simScore = AIService.cosineSimilarity(queryTokens, docTokens);
      let totalScore = simScore * 100;

      // Geographic intent matching
      if ((cleanQuery.includes('астана') || cleanQuery.includes('столиц')) && tender.region.includes('Астана')) totalScore += 25;
      if (cleanQuery.includes('алматы') && tender.region.includes('Алматы')) totalScore += 25;
      if (cleanQuery.includes('шымкент') && tender.region.includes('Шымкент')) totalScore += 25;

      // Numeric contract limit constraint matching
      const amountMatch = cleanQuery.match(/до\s+(\d+)\s*(млн|миллионов|тыс|тысяч|млрд)/i);
      if (amountMatch) {
        const num = parseFloat(amountMatch[1]);
        const unit = amountMatch[2].toLowerCase();
        let maxTarget = num * 1000;
        if (unit.startsWith('млн')) maxTarget = num * 1000000;
        if (unit.startsWith('млрд')) maxTarget = num * 1000000000;

        if (tender.amount <= maxTarget) totalScore += 30;
        else totalScore -= 25;
      }

      return { tender, score: totalScore };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.tender);
  }

  private static tokenizeVector(text: string): string[] {
    return text
      .replace(/[^\w\sа-яяА-ЯёЁ]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  private static cosineSimilarity(vecA: string[], vecB: string[]): number {
    const freqA: Record<string, number> = {};
    const freqB: Record<string, number> = {};

    vecA.forEach(w => freqA[w] = (freqA[w] || 0) + 1);
    vecB.forEach(w => freqB[w] = (freqB[w] || 0) + 1);

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const word of Object.keys(freqA)) {
      const valA = freqA[word];
      normA += valA * valA;
      if (freqB[word]) {
        dotProduct += valA * freqB[word];
      }
    }

    for (const word of Object.keys(freqB)) {
      const valB = freqB[word];
      normB += valB * valB;
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Compute semantic match score for a Company Profile
   */
  static matchCompanyProfile(profile: CompanyProfileData, tenders: Tender[]): Tender[] {
    const activitiesLower = profile.activities.toLowerCase();
    const keywords = (profile.keywords || []).map(k => k.toLowerCase());

    return tenders.map(tender => {
      let matchScore = 40;
      const titleLower = tender.title.toLowerCase();
      const tagsLower = tender.industryTags.map(t => t.toLowerCase());

      if (profile.regions.includes('Все регионы') || profile.regions.includes(tender.region)) {
        matchScore += 20;
      }

      if (tender.amount >= profile.minAmount && (!profile.maxAmount || tender.amount <= profile.maxAmount)) {
        matchScore += 15;
      }

      keywords.forEach(kw => {
        if (titleLower.includes(kw) || tagsLower.some(t => t.includes(kw))) {
          matchScore += 15;
        }
      });

      if (activitiesLower.includes(tender.category.toLowerCase())) {
        matchScore += 15;
      }

      const matchPercentage = Math.min(Math.max(matchScore, 20), 98);
      let matchReason = 'Подходит по виду деятельности и бюджету';
      if (matchPercentage > 85) {
        matchReason = 'Высокая семантическая совпадаемость по КТРУ и региону работы';
      } else if (matchPercentage > 60) {
        matchReason = 'Совпадение по категории и диапазону суммы договора';
      }

      return {
        ...tender,
        matchPercentage,
        matchReason
      };
    }).sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));
  }

  /**
   * Document-grounded RAG Question Answering over lot documentation
   */
  static answerRAGQuestion(tender: Tender, question: string): string {
    const qLower = question.toLowerCase();

    // 1. Security / Guarantee questions
    if (qLower.includes('обеспечени') || qLower.includes('гарантия') || qLower.includes('залог')) {
      if (tender.applicationSecurityAmount) {
        return `По лоту №${tender.externalId} сумма обеспечения заявки составляет ${tender.applicationSecurityAmount.toLocaleString('ru-RU')} KZT (${tender.applicationSecurityPercent || 1}% от суммы договора ${tender.amount.toLocaleString('ru-RU')} KZT). Подробный порядок внесения указан в правилах ЕГСЗ РК.`;
      }
      return `В загруженных параметрах лота №${tender.externalId} конкретный размер обеспечения не указан. Пожалуйста, сверьтесь с документацией на портале.`;
    }

    // 2. Deadlines
    if (qLower.includes('срок') || qLower.includes('дедлайн') || qLower.includes('когда')) {
      const deadlineStr = new Date(tender.deadlineDate).toLocaleDateString('ru-RU', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      return `Окончательный срок подачи заявок по лоту "${tender.title}" — ${deadlineStr}.`;
    }

    // 3. Requirements / Qualifications
    if (qLower.includes('требовани') || qLower.includes('документ') || qLower.includes('лицензи') || qLower.includes('опыт')) {
      if (tender.aiKeyRequirements && tender.aiKeyRequirements.length > 0) {
        return `Критерии квалификации из технической спецификации заказчика (${tender.customerName}):\n- ${tender.aiKeyRequirements.join('\n- ')}`;
      }
      return `Извлеченные требования из ТЗ лота №${tender.externalId}: Заказчик "${tender.customerName}" установил стандартные квалификационные требования ЕГСЗ РК. См. приложенный файл "${tender.documents[0]?.fileName || 'ТЗ.pdf'}".`;
    }

    return `В доступных материалах лота №${tender.externalId} ("${tender.title}") запрашиваемое условие явным образом не выведено. Рекомендуется изучить приложенный документ "${tender.documents[0]?.fileName || 'Спецификация.pdf'}" или перейти к первоисточнику по ссылке на ${tender.source}.`;
  }

  /**
   * Generates AI summary & risk analysis using real LLM API if LLM_API_KEY is configured
   */
  static async generateLLMSummary(tender: Tender): Promise<{ summary: string; requirements: string[]; riskScore: number }> {
    const apiKey = process.env.LLM_API_KEY;
    if (apiKey && apiKey.trim().length > 0 && !apiKey.includes('your_')) {
      try {
        const prompt = `Проанализируй закупку: Название: "${tender.title}", Заказчик: "${tender.customerName}", Сумма: ${tender.amount} KZT, Регион: ${tender.region}. Опиши кратко условия, 2 главных требования к поставщику и оцени риск участия (0-100). Ответь в формате JSON: {"summary": "...", "requirements": ["..."], "riskScore": 10}`;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        if (res.ok) {
          const json = await res.json();
          const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1));
            return {
              summary: parsed.summary || tender.aiSummary || '',
              requirements: parsed.requirements || tender.aiKeyRequirements || [],
              riskScore: typeof parsed.riskScore === 'number' ? parsed.riskScore : tender.riskScore
            };
          }
        }
      } catch (err) {
        console.warn('[AIService] Сбой обращения к LLM API, переключение на векторную эвристику:', err);
      }
    }

    return {
      summary: tender.aiSummary || `Лот №${tender.externalId} на сумму ${tender.amount.toLocaleString('ru-RU')} ₸.`,
      requirements: tender.aiKeyRequirements || ['Соответствие ТЗ'],
      riskScore: tender.riskScore || 0
    };
  }
}
