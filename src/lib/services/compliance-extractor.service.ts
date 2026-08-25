import * as cheerio from 'cheerio';
import { safeFetchUrl } from '../security/ssrf';

export interface ExtractedProductData {
  text: string;
  sourceType: 'MANUAL_TEXT' | 'URL' | 'FILE';
  productName?: string;
  isMultimodal?: boolean;
  imageBuffer?: Buffer;
  imageMimeType?: string;
}

export class ComplianceExtractorService {
  /**
   * Extracts clean text content from a web page URL.
   * Strips out scripts, styles, navigation, footer, forms, and layout clutter.
   */
  static async extractFromUrl(url: string): Promise<ExtractedProductData> {
    const fetchResult = await safeFetchUrl(url, {
      timeoutMs: 10000,
      maxSizeBytes: 5 * 1024 * 1024 // 5 MB
    });

    if (!fetchResult.ok) {
      throw new Error(`Ошибка загрузки страницы (HTTP ${fetchResult.status} ${fetchResult.statusText})`);
    }

    const html = fetchResult.text;
    const $ = cheerio.load(html);

    // Remove noise elements
    $('script, style, noscript, nav, header, footer, aside, iframe, svg, form, select, button').remove();

    // Extract title / product name candidate
    const title = $('h1').first().text().trim() || $('title').text().trim();

    // Look for product specs container if present, otherwise extract body text
    const specContainers = [
      '.product-specs',
      '#specifications',
      '.specifications',
      '.product-characteristics',
      '.tech-specs',
      '.characteristics',
      'table',
      'main',
      '#content',
      'article'
    ];

    let extracted = '';
    for (const selector of specContainers) {
      if ($(selector).length > 0) {
        extracted = $(selector).text();
        break;
      }
    }

    if (!extracted || extracted.trim().length < 50) {
      extracted = $('body').text();
    }

    // Clean whitespace
    const cleanText = extracted
      .replace(/[\r\n\t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    if (!cleanText || cleanText.length < 10) {
      throw new Error('Не удалось извлечь осмысленный текст характеристик со страницы товара');
    }

    return {
      text: cleanText.substring(0, 30000), // Clamp to prevent unbounded context
      sourceType: 'URL',
      productName: title.substring(0, 200) || undefined
    };
  }

  /**
   * Extracts text or vision input from a file buffer (PDF or Image).
   */
  static async extractFromFile(
    buffer: Buffer,
    fileName: string,
    mimeType?: string
  ): Promise<ExtractedProductData> {
    const lowerName = fileName.toLowerCase();
    const resolvedMime = mimeType || ComplianceExtractorService.inferMimeType(fileName);

    // 1. PDF File handling
    if (lowerName.endsWith('.pdf') || resolvedMime === 'application/pdf') {
      try {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buffer);
        const text = (data.text || '').trim();

        if (text.length >= 50) {
          return {
            text: text.substring(0, 30000),
            sourceType: 'FILE',
            productName: fileName.replace(/\.[^/.]+$/, '')
          };
        }
      } catch (err) {
        console.warn('[ComplianceExtractorService] Ошибка парсинга PDF текстового слоя:', err);
      }

      // If PDF text extraction yielded too little text (scanned PDF), return as multimodal document
      return {
        text: `[Scanned PDF Document: ${fileName}]`,
        sourceType: 'FILE',
        productName: fileName.replace(/\.[^/.]+$/, ''),
        isMultimodal: true,
        imageBuffer: buffer,
        imageMimeType: 'application/pdf'
      };
    }

    // 2. Image formats (jpg, jpeg, png, webp) for Multimodal Vision OCR
    if (
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg') ||
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.webp') ||
      resolvedMime.startsWith('image/')
    ) {
      return {
        text: `[Image / Screenshot: ${fileName}]`,
        sourceType: 'FILE',
        productName: fileName.replace(/\.[^/.]+$/, ''),
        isMultimodal: true,
        imageBuffer: buffer,
        imageMimeType: resolvedMime
      };
    }

    // 3. Fallback text file / docx
    if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        if (result.value && result.value.trim().length > 0) {
          return {
            text: result.value.trim().substring(0, 30000),
            sourceType: 'FILE',
            productName: fileName.replace(/\.[^/.]+$/, '')
          };
        }
      } catch (err) {
        console.warn('[ComplianceExtractorService] Ошибка чтения DOCX:', err);
      }
    }

    // Plain text fallback
    const rawText = buffer.toString('utf8').trim();
    if (!rawText) {
      throw new Error(`Файл ${fileName} пуст или имеет неподдерживаемый формат`);
    }

    return {
      text: rawText.substring(0, 30000),
      sourceType: 'FILE',
      productName: fileName.replace(/\.[^/.]+$/, '')
    };
  }

  private static inferMimeType(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop() || '';
    switch (ext) {
      case 'pdf': return 'application/pdf';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'png': return 'image/png';
      case 'webp': return 'image/webp';
      default: return 'application/octet-stream';
    }
  }
}
