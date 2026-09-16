import { Tender, CompanyProfile } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export interface DocumentRequirementData {
  label: string;
  isCompleted: boolean;
  notes?: string | null;
}

export interface DocumentCalculationData {
  recommendedPrice?: number | string | null;
  totalCost?: number | string | null;
  targetMarginPct?: number | string | null;
  startPrice?: number | string | null;
}

export interface DocumentGenerationContext {
  requirements?: DocumentRequirementData[];
  calculation?: DocumentCalculationData | null;
}

export const PLACEHOLDER_MAP: Record<string, (tender: Tender, profile: CompanyProfile) => string> = {
  '{{companyName}}': (_, p) => p.companyName || '—',
  '{{bin}}': (_, p) => p.bin || '—',
  '{{tenderTitle}}': (t) => t.title || '—',
  '{{tenderAmount}}': (t) => t.amount ? t.amount.toLocaleString('ru-RU') : '0',
  '{{customerName}}': (t) => t.customerName || '—',
  '{{deadlineDate}}': (t) => t.deadlineDate ? new Date(t.deadlineDate).toLocaleDateString('ru-RU') : '—',
  '{{today}}': () => new Date().toLocaleDateString('ru-RU')
};

export class DocGeneratorService {
  /**
   * Loads context for document generation:
   * - Requirement checklist items (TenderRequirementItem, with fallback to aiKeyRequirements)
   * - TenderCalculation (if calculated for this tender and company)
   */
  static async loadGenerationContext(
    tenderId: string,
    companyProfileId?: string
  ): Promise<DocumentGenerationContext> {
    const context: DocumentGenerationContext = {
      requirements: [],
      calculation: null
    };

    try {
      // 1. Fetch requirements sorted with completed items first
      const items = await prisma.tenderRequirementItem.findMany({
        where: { tenderId },
        orderBy: [
          { isCompleted: 'desc' },
          { createdAt: 'asc' }
        ]
      });

      if (items.length > 0) {
        context.requirements = items.map(item => ({
          label: item.label,
          isCompleted: item.isCompleted,
          notes: item.notes
        }));
      } else {
        // Fallback to tender.aiKeyRequirements if items are not yet materialized
        const tender = await prisma.tender.findUnique({
          where: { id: tenderId },
          select: { aiKeyRequirements: true }
        });

        if (tender?.aiKeyRequirements && tender.aiKeyRequirements.length > 0) {
          context.requirements = tender.aiKeyRequirements
            .filter(r => r && r.trim().length > 0)
            .map(r => ({
              label: r.trim(),
              isCompleted: false,
              notes: null
            }));
        }
      }

      // 2. Fetch cost calculation if companyProfileId is provided
      if (companyProfileId) {
        const calc = await prisma.tenderCalculation.findUnique({
          where: {
            tenderId_companyId: {
              tenderId,
              companyId: companyProfileId
            }
          }
        });

        if (calc) {
          context.calculation = {
            recommendedPrice: calc.recommendedPrice ? Number(calc.recommendedPrice) : null,
            totalCost: calc.totalCost ? Number(calc.totalCost) : null,
            targetMarginPct: calc.targetMarginPct ? Number(calc.targetMarginPct) : null,
            startPrice: calc.startPrice ? Number(calc.startPrice) : null
          };
        }
      }
    } catch (err: any) {
      console.warn('[DocGeneratorService.loadGenerationContext warning]:', err?.message);
    }

    return context;
  }

  /**
   * Formats the requirements list section for document insertion.
   * Completed items are highlighted with confirmed status.
   */
  static formatRequirementsList(requirements?: DocumentRequirementData[]): string {
    if (!requirements || requirements.length === 0) {
      return [
        '1. Квалификационные и технические требования конкурсной документации Заказчика',
        '   Статус: Соответствует в полном объёме',
        '   Примечание: Потенциальный поставщик гарантирует полное соблюдение всех квалификационных и технических требований документации закупки.'
      ].join('\n');
    }

    // Sort: completed first
    const sorted = [...requirements].sort((a, b) => (b.isCompleted ? 1 : 0) - (a.isCompleted ? 1 : 0));

    return sorted
      .map((req, idx) => {
        const status = req.isCompleted
          ? 'Соответствует (подтверждено)'
          : 'Соответствует (обязуемся обеспечить согласно ТЗ)';
        const note = req.notes && req.notes.trim()
          ? req.notes.trim()
          : 'Требование принимается в полном объёме согласно спецификации Заказчика.';

        return `${idx + 1}. Требование: ${req.label}\n   Статус: ${status}\n   Примечание: ${note}`;
      })
      .join('\n\n');
  }

  /**
   * Formats the commercial offer section based on TenderCalculation (if available) or starting amount.
   */
  static formatCommercialOffer(tender: Tender, calculation?: DocumentCalculationData | null): string {
    if (calculation && calculation.recommendedPrice) {
      const recPrice = Number(calculation.recommendedPrice).toLocaleString('ru-RU');
      const cost = Number(calculation.totalCost || 0).toLocaleString('ru-RU');
      const margin = Number(calculation.targetMarginPct || 0);

      return `Ценовое предложение Участника: ${recPrice} ₸ (НДС включен). Расчётная себестоимость: ${cost} ₸, целевая рентабельность: ${margin}%.`;
    }

    const startAmount = tender.amount ? tender.amount.toLocaleString('ru-RU') : '0';
    return `Ценовое предложение Участника: ${startAmount} ₸ (НДС включен, в пределах плановой суммы закупки).`;
  }

  /**
   * Replaces all placeholders in the template text with actual data from Tender, CompanyProfile,
   * system date, and dynamic context (requirements list and calculation data).
   */
  static resolvePlaceholders(
    bodyTemplate: string,
    tender: Tender,
    profile: CompanyProfile,
    context?: DocumentGenerationContext
  ): string {
    let resolvedText = bodyTemplate;

    // 1. Resolve standard scalar placeholders
    for (const [placeholder, resolver] of Object.entries(PLACEHOLDER_MAP)) {
      const val = resolver(tender, profile);
      resolvedText = resolvedText.replaceAll(placeholder, val);
    }

    // 2. Resolve requirements list placeholder
    const requirementsFormatted = this.formatRequirementsList(context?.requirements);
    resolvedText = resolvedText.replaceAll('{{requirementsList}}', requirementsFormatted);
    resolvedText = resolvedText.replaceAll('{{requirementsTable}}', requirementsFormatted);

    // 3. Resolve commercial offer / calculation placeholders
    const commercialFormatted = this.formatCommercialOffer(tender, context?.calculation);
    resolvedText = resolvedText.replaceAll('{{commercialOffer}}', commercialFormatted);

    const offeredPrice = context?.calculation?.recommendedPrice
      ? Number(context.calculation.recommendedPrice).toLocaleString('ru-RU')
      : (tender.amount ? tender.amount.toLocaleString('ru-RU') : '0');
    resolvedText = resolvedText.replaceAll('{{offeredPrice}}', offeredPrice);

    return resolvedText;
  }

  /**
   * Generates a Microsoft Word (.docx) Buffer from template body text and document name.
   */
  static async generateDocxBuffer(title: string, resolvedBodyText: string): Promise<Buffer> {
    try {
      const docx = require('docx');
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;

      const lines = resolvedBodyText.split('\n');

      const paragraphs: any[] = [
        new Paragraph({
          text: title,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 }
        })
      ];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
        } else {
          // Check for section headers like "1. ", "2. ", or "ТЕХНИЧЕСКАЯ"
          const isSectionHeader = /^\d+\.\s+[А-ЯЁA-Z\s]+$/.test(trimmed) ||
            trimmed.startsWith('ТЕХНИЧЕСКАЯ') ||
            trimmed.startsWith('ГАРАНТИЙНОЕ') ||
            trimmed.startsWith('ДОВЕРЕННОСТЬ');

          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmed,
                  font: 'Times New Roman',
                  size: 24, // 12pt font
                  bold: isSectionHeader
                })
              ],
              spacing: { after: 150 }
            })
          );
        }
      }

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: paragraphs
          }
        ]
      });

      return await Packer.toBuffer(doc);
    } catch {
      // Fallback plain-text buffer if docx package encounters any issues
      const textContent = `${title}\n\n${resolvedBodyText}`;
      return Buffer.from(textContent, 'utf8');
    }
  }
}
