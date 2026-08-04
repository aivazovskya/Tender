import { Tender, CompanyProfile } from '@prisma/client';

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
   * Replaces all placeholders in the template text with actual data from Tender, CompanyProfile, and system date.
   */
  static resolvePlaceholders(bodyTemplate: string, tender: Tender, profile: CompanyProfile): string {
    let resolvedText = bodyTemplate;
    for (const [placeholder, resolver] of Object.entries(PLACEHOLDER_MAP)) {
      const val = resolver(tender, profile);
      resolvedText = resolvedText.replaceAll(placeholder, val);
    }
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
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: trimmed,
                  font: 'Times New Roman',
                  size: 24 // 12pt font
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
      // Fallback plain-text buffer if docx package is not installed
      const textContent = `${title}\n\n${resolvedBodyText}`;
      return Buffer.from(textContent, 'utf8');
    }
  }
}
