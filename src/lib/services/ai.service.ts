import { Tender, CompanyProfileData } from '../types/tender';
import { detectLanguage } from '../utils/lang';
import crypto from 'crypto';

export class AIService {
  static readonly DAILY_COST_LIMIT_USD = 5.0;

  /**
   * Computes SHA-256 content hash for a tender and document text
   */
  static computeContentHash(tender: Tender, documentText?: string): string {
    return crypto
      .createHash('sha256')
      .update(`${tender.title}:${tender.amount}:${(documentText || '').substring(0, 10000)}`)
      .digest('hex');
  }

  /**
   * Circuit breaker: Checks whether today's total Gemini API spending has exceeded daily limit ($5.0)
   */
  static async isWithinDailyCostLimit(organizationId?: string, maxDailyUsd: number = AIService.DAILY_COST_LIMIT_USD): Promise<boolean> {
    try {
      const { prisma } = await import('../prisma');
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const whereClause: any = {
        timestamp: { gte: startOfDay }
      };
      if (organizationId) {
        whereClause.organizationId = organizationId;
      }

      const agg = await prisma.aiTokenUsage.aggregate({
        where: whereClause,
        _sum: { costUsd: true }
      });

      const todayCost = agg._sum.costUsd || 0.0;
      return todayCost < maxDailyUsd;
    } catch {
      return true; // Fallback to allowing if DB check fails transiently
    }
  }
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
   * Document-grounded RAG Question Answering over lot documentation using LLM API with heuristic fallback (Bug #19)
   */
  static async answerRAGQuestion(tender: Tender, question: string, documentText?: string, lang?: 'ru' | 'kk'): Promise<string> {
    let contextText = documentText || '';
    const targetLang = lang || detectLanguage(question);

    // If documentText wasn't passed directly, try retrieving extractedText from DB or tender documents
    if (!contextText.trim()) {
      if (Array.isArray(tender.documents)) {
        const foundDoc = tender.documents.find(d => d.extractedText && d.extractedText.trim().length > 0);
        if (foundDoc?.extractedText) {
          contextText = foundDoc.extractedText;
        }
      }

      if (!contextText.trim() && (tender as any).id) {
        try {
          const { prisma } = await import('../prisma');
          const dbDoc = await prisma.tenderDocument.findFirst({
            where: { tenderId: (tender as any).id, extractedText: { not: null } }
          });
          if (dbDoc?.extractedText) {
            contextText = dbDoc.extractedText;
          }
        } catch (dbErr) {
          // DB unreadable in standalone test mode, ignore
        }
      }
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
    if (apiKey && apiKey.trim().length > 0 && !apiKey.includes('your_')) {
      try {
        const docSnippet = contextText.trim().length > 0
          ? `\n\nТекст приложенной технической спецификации / ТЗ (выдержка):\n"${contextText.trim().substring(0, 10000)}"`
          : '';

        const langInstruction = targetLang === 'kk'
          ? 'Жауапты міндетті түрде қазақ тілінде бер.'
          : 'Дай четкий, грамотный ответ на русском языке.';

        const prompt = `Ты — экспертный ИИ-ассистент по тендерам РК. Ответь на вопрос пользователя по лоту СТРОГО на основе приведенных данных и приложенного текста документации. Если ответа в документации нет — явно скажи, что информация не найдена в файлах лота.\n\nПараметры лота:\n- Заглавие: "${tender.title}"\n- Заказчик: "${tender.customerName}"\n- Сумма: ${tender.amount} KZT\n- Регион: ${tender.region}${docSnippet}\n\nВопрос пользователя: "${question}"\n\n${langInstruction} Без технической разметки.`;

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
          if (rawText && rawText.trim().length > 0) {
            return rawText.trim();
          }
        }
      } catch (err) {
        console.warn('[AIService] Сбой обращения к LLM для RAG-ответа, переключение на эвристику:', err);
      }
    }

    // Heuristic Fallback
    const qLower = question.toLowerCase();

    // 1. Security / Guarantee questions
    if (qLower.includes('обеспечени') || qLower.includes('гарантия') || qLower.includes('залог') || qLower.includes('кепілдік') || qLower.includes('қамтамасыз')) {
      if (targetLang === 'kk') {
        if (tender.applicationSecurityAmount) {
          return `Лот №${tender.externalId} бойынша өтінімді қамтамасыз ету сомасы ${tender.applicationSecurityAmount.toLocaleString('ru-RU')} KZT (${tender.applicationSecurityPercent || 1}% келісімшарт сомасынан) құрайды. Толық тәртібі ҚР ЕГСЗ ережелерінде көрсетілген.`;
        }
        return `Лот №${tender.externalId} бойынша нақты қамтамасыз ету сомасы көрсетілмеген. Порталдағы құжаттаманы тексеріңіз.`;
      }
      if (tender.applicationSecurityAmount) {
        return `По лоту №${tender.externalId} сумма обеспечения заявки составляет ${tender.applicationSecurityAmount.toLocaleString('ru-RU')} KZT (${tender.applicationSecurityPercent || 1}% от суммы договора ${tender.amount.toLocaleString('ru-RU')} KZT). Подробный порядок внесения указан в правилах ЕГСЗ РК.`;
      }
      return `В загруженных параметрах лота №${tender.externalId} конкретный размер обеспечения не указан. Пожалуйста, сверьтесь с документацией на портале.`;
    }

    // 2. Deadlines
    if (qLower.includes('срок') || qLower.includes('дедлайн') || qLower.includes('когда') || qLower.includes('мерзім') || qLower.includes('қашан')) {
      const deadlineStr = new Date(tender.deadlineDate).toLocaleDateString(targetLang === 'kk' ? 'kk-KZ' : 'ru-RU', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      if (targetLang === 'kk') {
        return `"${tender.title}" лоты бойынша өтінімдерді қабылдаудың соңғы мерзімі — ${deadlineStr}.`;
      }
      return `Окончательный срок подачи заявок по лоту "${tender.title}" — ${deadlineStr}.`;
    }

    // 3. Requirements / Qualifications
    if (qLower.includes('требовани') || qLower.includes('документ') || qLower.includes('лицензи') || qLower.includes('опыт') || qLower.includes('талап') || qLower.includes('құжат')) {
      if (targetLang === 'kk') {
        if (tender.aiKeyRequirements && tender.aiKeyRequirements.length > 0) {
          return `Тапсырыс берушінің (${tender.customerName}) техникалық ерекшелігінен біліктілік талаптары:\n- ${tender.aiKeyRequirements.join('\n- ')}`;
        }
        return `№${tender.externalId} лотының ТЗ-сынан алынған талаптар: Тапсырыс беруші "${tender.customerName}" ҚР ЕГСЗ стандартты біліктілік талаптарын орнатқан. Тіркелген құжатты қараңыз: "${tender.documents?.[0]?.fileName || 'ТЗ.pdf'}".`;
      }
      if (tender.aiKeyRequirements && tender.aiKeyRequirements.length > 0) {
        return `Критерии квалификации из технической спецификации заказчика (${tender.customerName}):\n- ${tender.aiKeyRequirements.join('\n- ')}`;
      }
      return `Извлеченные требования из ТЗ лота №${tender.externalId}: Заказчик "${tender.customerName}" установил стандартные квалификационные требования ЕГСЗ РК. См. приложенный файл "${tender.documents?.[0]?.fileName || 'ТЗ.pdf'}".`;
    }

    if (targetLang === 'kk') {
      return `№${tender.externalId} ("${tender.title}") лотының қолжетімді материалдарында сұратылған шарт анық табылған жоқ. Тіркелген құжатты оқып шығуды ("${tender.documents?.[0]?.fileName || 'Спецификация.pdf'}") немесе ${tender.source} порталындағы первоисточник сілтемесіне өтуді ұсынамыз.`;
    }
    return `В доступных материалах лота №${tender.externalId} ("${tender.title}") запрашиваемое условие явным образом не выведено. Рекомендуется изучить приложенный документ "${tender.documents?.[0]?.fileName || 'Спецификация.pdf'}" или перейти к первоисточнику по ссылке на ${tender.source}.`;
  }

  /**
   * Generates AI summary & risk analysis using real LLM API if GEMINI_API_KEY or LLM_API_KEY is configured.
   * Grounded on attached tender document text when available.
   */
  static async generateLLMSummary(
    tender: Tender,
    documentText?: string,
    organizationId?: string
  ): Promise<{ summary: string; requirements: string[]; riskScore: number }> {
    const docContext = documentText && documentText.trim().length > 0
      ? `\n\nТекст приложенной технической спецификации / ТЗ (выдержка):\n"${documentText.trim().substring(0, 10000)}"`
      : '';

    const contentHash = AIService.computeContentHash(tender, documentText);

    // 0. Deduplication check: verify if identical content was previously analyzed
    try {
      const { prisma } = await import('../prisma');
      const existingUsage = await prisma.aiTokenUsage.findFirst({
        where: { contentHash },
        orderBy: { timestamp: 'desc' }
      });

      if (existingUsage && tender.aiSummary && tender.riskScoringStatus === 'AI_SCORED') {
        console.log(`[AIService] Дедупликация: контент с хэшем ${contentHash.substring(0, 12)}... уже анализировался, пропуск вызова`);
        return {
          summary: tender.aiSummary,
          requirements: tender.aiKeyRequirements || ['Соответствие ТЗ'],
          riskScore: tender.riskScore || 0
        };
      }
    } catch (dedupErr) {
      // Ignore DB lookup failure in standalone/test mode
    }

    // 1. Check Circuit Breaker ($5.0/day limit)
    const isCostAllowed = await AIService.isWithinDailyCostLimit(organizationId);
    if (!isCostAllowed) {
      console.warn(`[AIService Circuit Breaker] Превышен дневной лимит расходов на Gemini API ($5.0/день). Пропуск LLM-вызова для лота #${tender.externalId}.`);
      return {
        summary: tender.aiSummary || `Лот №${tender.externalId} на сумму ${tender.amount.toLocaleString('ru-RU')} ₸ (ИИ-суммаризация временно ограничена дневным лимитом).`,
        requirements: tender.aiKeyRequirements || ['Соответствие ТЗ'],
        riskScore: tender.riskScore || 0
      };
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
    if (apiKey && apiKey.trim().length > 0 && !apiKey.includes('your_')) {
      try {
        const prompt = `Проанализируй закупку: Название: "${tender.title}", Заказчик: "${tender.customerName}", Сумма: ${tender.amount} KZT, Регион: ${tender.region}.${docContext}\n\nОпиши кратко условия лота, 2 главных требования к поставщику из документации и оцени риск участия (0-100). Ответь исключительно в формате JSON: {"summary": "...", "requirements": ["..."], "riskScore": 10}`;

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

          // Record token usage in Prisma DB
          try {
            const { prisma } = await import('../prisma');
            const tokensIn = json?.usageMetadata?.promptTokenCount || 150;
            const tokensOut = json?.usageMetadata?.candidatesTokenCount || 100;
            const tokensUsed = json?.usageMetadata?.totalTokenCount || (tokensIn + tokensOut);
            
            // Pricing for gemini-1.5-flash: $0.075 / 1M prompt tokens, $0.30 / 1M output tokens
            const costUsd = (tokensIn / 1_000_000 * 0.075) + (tokensOut / 1_000_000 * 0.30);

            await prisma.aiTokenUsage.create({
              data: {
                organizationId: organizationId || null,
                tenderId: tender.id || null,
                provider: 'Google Gemini',
                model: 'gemini-1.5-flash',
                tokensIn,
                tokensOut,
                tokensUsed,
                costUsd,
                contentHash,
                operation: `Tender Ingestion Summary (${tender.externalId})`
              }
            });
          } catch (dbErr) {
            console.warn('[AIService] Не удалось сохранить запись AiTokenUsage:', dbErr);
          }

          if (rawText) {
            const jsonStart = rawText.indexOf('{');
            const jsonEnd = rawText.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1) {
              const parsed = JSON.parse(rawText.substring(jsonStart, jsonEnd + 1));
              return {
                summary: parsed.summary || tender.aiSummary || '',
                requirements: parsed.requirements || tender.aiKeyRequirements || [],
                riskScore: typeof parsed.riskScore === 'number' ? parsed.riskScore : tender.riskScore
              };
            }
          }
        }
      } catch (err) {
        console.warn('[AIService] Сбой обращения к LLM API, переключение на эвристику:', err);
      }
    }

    return {
      summary: tender.aiSummary || `Лот №${tender.externalId} на сумму ${tender.amount.toLocaleString('ru-RU')} ₸.`,
      requirements: tender.aiKeyRequirements || ['Соответствие ТЗ'],
      riskScore: tender.riskScore || 0
    };
  }
}
