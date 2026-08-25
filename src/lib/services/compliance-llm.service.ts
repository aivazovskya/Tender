import crypto from 'crypto';
import { AIService } from './ai.service';

export interface ComplianceItem {
  requirement: string;
  productValue: string | null;
  status: 'MATCH' | 'MISMATCH' | 'MISSING' | 'UNCLEAR';
  isCritical: boolean;
  comment?: string;
}

export interface ComplianceResult {
  productName?: string;
  items: ComplianceItem[];
  compliancePercent: number;
  verdict: 'COMPLIANT' | 'PARTIAL' | 'NOT_COMPLIANT';
  rawLlmResponse?: string;
  tokensUsed?: number;
  costUsd?: number;
}

export interface LlmProvider {
  runComplianceCheck(params: {
    tzText: string;
    productText?: string;
    productBuffer?: Buffer;
    productMimeType?: string;
    tier: 'FREE' | 'PAID';
    organizationId?: string;
  }): Promise<ComplianceResult>;
}

/**
 * Deterministic verdict calculation according to TZ requirements (Section 4.3):
 * - compliancePercent = round(matchedCount / totalItems * 100)
 * - If ANY critical item has status MISMATCH or MISSING => verdict = NOT_COMPLIANT (critical veto)
 * - Else if compliancePercent >= 90 => verdict = COMPLIANT
 * - Else => verdict = PARTIAL
 */
export function computeComplianceVerdict(items: ComplianceItem[]): {
  compliancePercent: number;
  verdict: 'COMPLIANT' | 'PARTIAL' | 'NOT_COMPLIANT';
  criticalMismatches: ComplianceItem[];
} {
  const totalItems = items.length;
  if (totalItems === 0) {
    return {
      compliancePercent: 0,
      verdict: 'NOT_COMPLIANT',
      criticalMismatches: []
    };
  }

  const matchedCount = items.filter(i => i.status === 'MATCH').length;
  const compliancePercent = Math.round((matchedCount / totalItems) * 100);

  const criticalMismatches = items.filter(
    i => i.isCritical && (i.status === 'MISMATCH' || i.status === 'MISSING')
  );

  let verdict: 'COMPLIANT' | 'PARTIAL' | 'NOT_COMPLIANT';
  if (criticalMismatches.length > 0) {
    verdict = 'NOT_COMPLIANT';
  } else if (compliancePercent >= 90) {
    verdict = 'COMPLIANT';
  } else {
    verdict = 'PARTIAL';
  }

  return {
    compliancePercent,
    verdict,
    criticalMismatches
  };
}

export class GeminiComplianceLlmProvider implements LlmProvider {
  /**
   * Runs AI-powered compliance analysis matching product specs against tender TZ requirements.
   */
  async runComplianceCheck(params: {
    tzText: string;
    productText?: string;
    productBuffer?: Buffer;
    productMimeType?: string;
    tier: 'FREE' | 'PAID';
    organizationId?: string;
  }): Promise<ComplianceResult> {
    const { tzText, productText, productBuffer, productMimeType, tier, organizationId } = params;

    const modelName = tier === 'PAID' ? 'gemini-1.5-pro' : 'gemini-1.5-flash';
    const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;

    // Check circuit breaker limit
    const withinCost = await AIService.isWithinDailyCostLimit(organizationId);
    if (!withinCost) {
      console.warn(`[GeminiComplianceLlmProvider] Circuit breaker: Daily cost limit reached. Switching to heuristic matching.`);
      return GeminiComplianceLlmProvider.runHeuristicMatching(tzText, productText || '');
    }

    if (apiKey && apiKey.trim().length > 0 && !apiKey.includes('your_')) {
      try {
        const systemPrompt = `Ты — эксперт по анализу тендерных технических спецификаций (ТЗ) и сопоставлению характеристик товаров в Казахстане (ЕГСЗ / Самрук-Казына).

ЗАДАЧА:
1. Разбей текст ТЗ тендера на отдельные атомарные требования (пункты).
2. Для каждого требования ТЗ найди соответствующее значение среди характеристик предоставленного товара.
3. Присвой каждому пункту один из 4 статусов:
   - "MATCH": характеристика товара полностью соответствует или превосходит требование ТЗ.
   - "MISMATCH": характеристика товара прямо противоречит требованию ТЗ (например, меньше нужного, другой бренд/материал, худший параметр).
   - "MISSING": в описании/документе товара информация по этому пункту ТЗ отсутствует.
   - "UNCLEAR": формулировка в ТЗ или у товара неоднозначна / требует доуточнения.
4. Пометь требование как критичное ("isCritical": true), если в тексте ТЗ есть маркеры обязательности: "обязательно", "не менее", "не более", "должен", "требуется", ссылки на ГОСТ, СТ РК, ТР ТС, точные числовые допуски или обязательные сертификаты.
5. Если в данных товара указано наименование модели/бренда — укажи его в "productName".

ОТВЕТЬ ИСКЛЮЧИТЕЛЬНО В ФОРМАТЕ JSON БЕЗ ПРЕАМБУЛЫ И СУФФИКСА:
{
  "productName": "Наименование товара или null",
  "items": [
    {
      "requirement": "Текст пункта требования ТЗ",
      "productValue": "Найденное значение у товара или null",
      "status": "MATCH" | "MISMATCH" | "MISSING" | "UNCLEAR",
      "isCritical": true | false,
      "comment": "Краткое пояснение (особенно при расхождении или неясности)"
    }
  ]
}`;

        const contentsParts: any[] = [];

        // If an image/scanned PDF buffer is present, attach multimodal inlineData
        if (productBuffer && productMimeType) {
          contentsParts.push({
            inlineData: {
              data: productBuffer.toString('base64'),
              mimeType: productMimeType
            }
          });
        }

        const userPrompt = `--- ТЕКСТ ТЗ ТЕНДЕРА ---:\n${tzText}\n\n--- ХАРАКТЕРИСТИКИ ТОВАРА ---:\n${productText || '[См. прикрепленный файл]'}\n\nВыполни детальное сопоставление и сформируй итоговый JSON.`;
        contentsParts.push({ text: userPrompt });

        const requestBody = {
          contents: [{ parts: contentsParts }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        };

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          }
        );

        if (res.ok) {
          const json = await res.json();
          const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;

          // Token accounting
          const tokensIn = json?.usageMetadata?.promptTokenCount || 500;
          const tokensOut = json?.usageMetadata?.candidatesTokenCount || 400;
          const tokensUsed = json?.usageMetadata?.totalTokenCount || (tokensIn + tokensOut);

          // Pricing calculation:
          // Flash: $0.075 / 1M in, $0.30 / 1M out
          // Pro: $3.50 / 1M in, $10.50 / 1M out
          const costIn = tier === 'PAID' ? 3.50 : 0.075;
          const costOut = tier === 'PAID' ? 10.50 : 0.30;
          const costUsd = (tokensIn / 1_000_000 * costIn) + (tokensOut / 1_000_000 * costOut);

          const contentHash = crypto
            .createHash('sha256')
            .update(`${tzText}:${productText || ''}:${tier}`)
            .digest('hex');

          // Persist token usage record
          try {
            const { prisma } = await import('../prisma');
            await prisma.aiTokenUsage.create({
              data: {
                organizationId: organizationId || null,
                provider: 'Google Gemini',
                model: modelName,
                tokensIn,
                tokensOut,
                tokensUsed,
                costUsd,
                contentHash,
                operation: `Compliance Check (${tier})`
              }
            });
          } catch (dbErr) {
            console.warn('[GeminiComplianceLlmProvider] Ошибка записи AiTokenUsage:', dbErr);
          }

          if (rawText) {
            const parsed = JSON.parse(rawText);
            const items: ComplianceItem[] = Array.isArray(parsed.items)
              ? parsed.items.map((it: any) => ({
                  requirement: String(it.requirement || 'Требование ТЗ'),
                  productValue: it.productValue ? String(it.productValue) : null,
                  status: ['MATCH', 'MISMATCH', 'MISSING', 'UNCLEAR'].includes(it.status) ? it.status : 'UNCLEAR',
                  isCritical: Boolean(it.isCritical),
                  comment: it.comment ? String(it.comment) : undefined
                }))
              : [];

            if (items.length > 0) {
              const { compliancePercent, verdict } = computeComplianceVerdict(items);
              return {
                productName: parsed.productName || undefined,
                items,
                compliancePercent,
                verdict,
                rawLlmResponse: rawText,
                tokensUsed,
                costUsd
              };
            }
          }
        } else {
          const errBody = await res.text().catch(() => '');
          console.warn(`[GeminiComplianceLlmProvider] HTTP ${res.status} from Gemini API:`, errBody);
        }
      } catch (err: any) {
        console.warn('[GeminiComplianceLlmProvider] Ошибка вызова Gemini API:', err?.message || err);
      }
    }

    // Heuristic fallback for offline/test/demo mode
    return GeminiComplianceLlmProvider.runHeuristicMatching(tzText, productText || '');
  }

  /**
   * Deterministic heuristic parser and matcher for test/offline/demo scenarios.
   */
  static runHeuristicMatching(tzText: string, productText: string): ComplianceResult {
    const rawLines = tzText
      .split(/\n+/)
      .map(l => l.trim())
      .filter(l => l.length > 5);

    // Extract requirements from bullet points or numbered lists or lines
    const requirements: Array<{ text: string; isCritical: boolean }> = [];

    for (const line of rawLines) {
      // Skip title/header-like lines
      if (/^(тз|техническая спецификация|приложение|заказчик|лот|наименование:)/i.test(line)) {
        continue;
      }

      const cleanReq = line.replace(/^[\d\.\-\*\)\s]+/, '').trim();
      if (cleanReq.length < 5) continue;

      const lower = cleanReq.toLowerCase();
      const isCritical =
        lower.includes('обязательн') ||
        lower.includes('не менее') ||
        lower.includes('не более') ||
        lower.includes('должен') ||
        lower.includes('требуется') ||
        lower.includes('гост') ||
        lower.includes('ст рк') ||
        lower.includes('тр тс') ||
        /\d+\s*(гб|ггц|вт|мм|см|м|кг|квт|v|в|fps|dpi|мп|mp)/i.test(lower);

      requirements.push({ text: cleanReq, isCritical });
    }

    if (requirements.length === 0) {
      requirements.push({ text: tzText.substring(0, 300), isCritical: true });
    }

    const prodLower = productText.toLowerCase();

    // Match each requirement against product text
    const items: ComplianceItem[] = requirements.map(req => {
      const words = req.text
        .toLowerCase()
        .replace(/[^\wа-яё0-9]/gi, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);

      let matchedWords = 0;
      for (const w of words) {
        // Match exact or stem of word (e.g. "гарант" for "гарантийный" / "гарантия")
        const stem = w.length > 4 ? w.substring(0, 4) : w;
        if (prodLower.includes(w) || prodLower.includes(stem)) {
          matchedWords++;
        }
      }

      const matchRatio = words.length > 0 ? matchedWords / words.length : 0;

      // Extract candidate value snippet
      let productValue: string | null = null;
      if (matchRatio >= 0.25) {
        // Find matching line in product text
        const prodLines = productText.split('\n');
        const found = prodLines.find(pl => {
          const plLower = pl.toLowerCase();
          return words.some(w => plLower.includes(w.length > 4 ? w.substring(0, 4) : w));
        });
        if (found) {
          productValue = found.trim().substring(0, 150);
        }
      }

      let status: 'MATCH' | 'MISMATCH' | 'MISSING' | 'UNCLEAR';
      let comment: string | undefined;

      if (matchRatio >= 0.4) {
        status = 'MATCH';
        comment = 'Характеристика найдена и соответствует требованию ТЗ';
      } else if (matchRatio >= 0.2) {
        status = 'UNCLEAR';
        comment = 'Частичное упоминание в описании, требуется уточнение точных параметров';
      } else {
        status = req.isCritical ? 'MISMATCH' : 'MISSING';
        comment = req.isCritical
          ? 'Критичное требование не подтверждено в характеристиках товара'
          : 'Сведения по данному пункту отсутствуют в описании товара';
      }

      return {
        requirement: req.text,
        productValue,
        status,
        isCritical: req.isCritical,
        comment
      };
    });

    const { compliancePercent, verdict } = computeComplianceVerdict(items);

    // Extract product name candidate from first line of product text
    const prodLines = productText.split('\n').map(l => l.trim()).filter(Boolean);
    const productName = prodLines[0] ? prodLines[0].substring(0, 100) : undefined;

    return {
      productName,
      items,
      compliancePercent,
      verdict,
      rawLlmResponse: JSON.stringify({ productName, items, compliancePercent, verdict })
    };
  }
}

export const defaultLlmProvider = new GeminiComplianceLlmProvider();
