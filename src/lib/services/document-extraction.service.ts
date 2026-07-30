import fs from 'fs';
import path from 'path';
import { validateUrlForSSRF } from '../security/ssrf';

export class DocumentExtractionService {
  private static MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
  private static TIMEOUT_MS = 10000; // 10 seconds timeout

  /**
   * Downloads document from fileUrl (with SSRF security validation) and extracts raw text
   */
  static async extractTextFromDocumentUrl(fileUrl: string): Promise<string | null> {
    if (!fileUrl || typeof fileUrl !== 'string') {
      return null;
    }

    const cleanUrl = fileUrl.trim();

    // 1. Handle relative local demo document paths (/docs/...)
    if (cleanUrl.startsWith('/docs/') || cleanUrl.startsWith('docs/')) {
      return DocumentExtractionService.handleLocalDemoDocument(cleanUrl);
    }

    // 2. SSRF Security Validation for remote URLs
    const ssrfCheck = validateUrlForSSRF(cleanUrl);
    if (!ssrfCheck.allowed) {
      console.warn(`[DocumentExtractionService] SSRF Protection blocked request to '${cleanUrl}': ${ssrfCheck.reason}`);
      return null;
    }

    // 3. Fetch remote file with timeout & size limit
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DocumentExtractionService.TIMEOUT_MS);

      const response = await fetch(cleanUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'TenderAI-Bot/1.0 (+https://goszakup.gov.kz)'
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[DocumentExtractionService] HTTP ${response.status} error fetching document from '${cleanUrl}'`);
        return null;
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > DocumentExtractionService.MAX_FILE_SIZE_BYTES) {
        console.warn(`[DocumentExtractionService] File size exceeds 15MB limit (${contentLength} bytes) for '${cleanUrl}'`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length > DocumentExtractionService.MAX_FILE_SIZE_BYTES) {
        console.warn(`[DocumentExtractionService] Downloaded buffer exceeds 15MB limit (${buffer.length} bytes)`);
        return null;
      }

      return await DocumentExtractionService.parseDocumentBuffer(buffer, cleanUrl);
    } catch (err: any) {
      console.warn(`[DocumentExtractionService] Failed to extract document text from '${cleanUrl}':`, err?.message || err);
      return null;
    }
  }

  /**
   * Parse document buffer based on file extension / content-type
   */
  private static async parseDocumentBuffer(buffer: Buffer, fileUrlOrName: string): Promise<string | null> {
    const lower = fileUrlOrName.toLowerCase();

    if (lower.endsWith('.pdf')) {
      try {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        return data.text ? data.text.trim() : null;
      } catch (err) {
        console.warn(`[DocumentExtractionService] Error parsing PDF buffer:`, err);
        // Fallback simple string extraction for basic text-like PDFs
        const text = buffer.toString('utf8').replace(/[^\x20-\x7E\u0400-\u04FF\n\r\t]/g, ' ');
        return text.trim().length > 50 ? text.substring(0, 10000) : null;
      }
    }

    if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        return result.value ? result.value.trim() : null;
      } catch (err) {
        console.warn(`[DocumentExtractionService] Error parsing DOCX buffer:`, err);
        return null;
      }
    }

    // Default plain text / JSON / HTML fallback
    try {
      const text = buffer.toString('utf8');
      return text.trim();
    } catch {
      return null;
    }
  }

  /**
   * Handle local /docs/... demo file paths
   */
  private static handleLocalDemoDocument(fileUrl: string): string {
    const fileName = path.basename(fileUrl);
    const localFilePath = path.join(process.cwd(), 'public', fileUrl);

    if (fs.existsSync(localFilePath)) {
      try {
        const content = fs.readFileSync(localFilePath, 'utf8');
        return content;
      } catch {
        // Fallback to structured demo text below
      }
    }

    if (fileName.includes('software') || fileName.includes('tz_software')) {
      return `ТЕХНИЧЕСКАЯ СПЕЦИФИКАЦИЯ (ТЗ)\nЛот: Поставка лицензий программного обеспечения графического дизайна.\nЗаказчик: КГУ "Колледж общественного питания и сервиса" Акимата г. Астана.\nТребования к поставляемому ПО:\n1. Лицензии на 12 месяцев с правом обновления на новые версии.\n2. Наличие официальной техподдержки разработчика на русском/казахском языке.\n3. Поставщик должен являться авторизованным партнером (дистрибьютором).\n4. Срок поставки: 15 календарных дней с момента подписания договора.`;
    }

    if (fileName.includes('fleet')) {
      return `ТЕХНИЧЕСКАЯ СПЕЦИФИКАЦИЯ (ТЗ)\nЛот: Услуги по автотранспортному обслуживанию и аренде спецтехники.\nЗаказчик: АО "Павлодарэнерго".\nТребования к технике:\n1. Год выпуска автотранспорта и спецтехники: не ранее 2020 года.\n2. Обязательное наличие страхования ГПО водителей и операторов.\n3. Наличие системы GPS/ГЛОНАСС мониторинга на всех единицах техники.\n4. Круглосуточная готовность техники к выезду на объекты энергетической инфраструктуры.`;
    }

    return `Техническая спецификация по лоту ${fileName}. Поставщик обязался выполнить работы в полном соответствии со стандартами Заказчика РК.`;
  }
}
