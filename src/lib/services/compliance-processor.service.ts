import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma';
import { ComplianceExtractorService, ExtractedProductData } from './compliance-extractor.service';
import { defaultLlmProvider, LlmProvider } from './compliance-llm.service';

export class ComplianceProcessorService {
  /**
   * Computes SHA-256 content hash for deduplication/caching
   */
  static computeContentHash(params: {
    tzText: string;
    sourceType: string;
    sourceRaw?: string | null;
    sourceFileUrl?: string | null;
    fileBuffer?: Buffer | null;
    llmTier: string;
  }): string {
    const fileHash = params.fileBuffer
      ? crypto.createHash('sha256').update(params.fileBuffer).digest('hex')
      : (params.sourceFileUrl || '');

    return crypto
      .createHash('sha256')
      .update(`${params.tzText.trim()}:::${params.sourceType}:::${(params.sourceRaw || '').trim()}:::${fileHash}:::${params.llmTier}`)
      .digest('hex');
  }

  /**
   * Main processing pipeline for a ComplianceCheck background task.
   */
  static async processComplianceCheck(
    checkId: string,
    fileBuffer?: Buffer,
    llmProvider: LlmProvider = defaultLlmProvider
  ): Promise<any> {
    const check = await prisma.complianceCheck.findUnique({
      where: { id: checkId },
      include: { companyProfile: true }
    });

    if (!check) {
      throw new Error(`Проверка соответствия с ID ${checkId} не найдена в базе данных`);
    }

    if (check.status === 'DONE') {
      return check;
    }

    // 1. Update status to PROCESSING
    await prisma.complianceCheck.update({
      where: { id: checkId },
      data: { status: 'PROCESSING', errorMessage: null }
    });

    try {
      // 2. Deduplication check: check if an identical check already finished with status DONE for this specific companyProfileId
      const cached = await prisma.complianceCheck.findFirst({
        where: {
          contentHash: check.contentHash,
          companyProfileId: check.companyProfileId,
          status: 'DONE',
          id: { not: checkId }
        },
        include: { items: true },
        orderBy: { createdAt: 'desc' }
      });

      if (cached && cached.items.length > 0) {
        console.log(`[ComplianceProcessor] Кэш/Дедупликация: найден готовый результат для хэша ${check.contentHash.substring(0, 12)}... Копирование данных без вызова LLM.`);

        // Delete any existing items for this check
        await prisma.complianceCheckItem.deleteMany({ where: { checkId } });

        // Copy items
        await prisma.complianceCheckItem.createMany({
          data: cached.items.map(item => ({
            checkId,
            requirementText: item.requirementText,
            productValue: item.productValue,
            status: item.status,
            isCritical: item.isCritical,
            comment: item.comment
          }))
        });

        // Update parent check to DONE
        const updated = await prisma.complianceCheck.update({
          where: { id: checkId },
          data: {
            status: 'DONE',
            productName: check.productName || cached.productName,
            verdict: cached.verdict,
            compliancePercent: cached.compliancePercent,
            errorMessage: null
          },
          include: { items: true }
        });

        return updated;
      }

      // 3. Extract product specifications according to sourceType
      let productData: ExtractedProductData;

      if (check.sourceType === 'URL') {
        if (!check.sourceRaw) {
          throw new Error('Для источника URL не указан адрес страницы товара');
        }
        productData = await ComplianceExtractorService.extractFromUrl(check.sourceRaw);
      } else if (check.sourceType === 'FILE') {
        let bufferToParse = fileBuffer;

        if (!bufferToParse && check.sourceFileUrl) {
          // If stored on local disk
          const localPath = path.join(process.cwd(), check.sourceFileUrl.startsWith('/') ? check.sourceFileUrl.substring(1) : check.sourceFileUrl);
          if (fs.existsSync(localPath)) {
            bufferToParse = fs.readFileSync(localPath);
          }
        }

        if (!bufferToParse) {
          throw new Error('Файл товара не найден или не был передан для обработки');
        }

        productData = await ComplianceExtractorService.extractFromFile(
          bufferToParse,
          check.sourceFileUrl || 'product_spec.pdf'
        );
      } else {
        // MANUAL_TEXT
        productData = {
          text: check.sourceRaw || '',
          sourceType: 'MANUAL_TEXT'
        };
      }

      // 4. Run LLM Compliance Check
      const result = await llmProvider.runComplianceCheck({
        tzText: check.tzText,
        productText: productData.text,
        productBuffer: productData.imageBuffer,
        productMimeType: productData.imageMimeType,
        tier: check.llmTier as 'FREE' | 'PAID',
        organizationId: check.companyProfile?.organizationId || undefined
      });

      // 5. Persist Items
      await prisma.complianceCheckItem.deleteMany({ where: { checkId } });

      if (result.items && result.items.length > 0) {
        await prisma.complianceCheckItem.createMany({
          data: result.items.map(item => ({
            checkId,
            requirementText: item.requirement,
            productValue: item.productValue,
            status: item.status,
            isCritical: item.isCritical,
            comment: item.comment || null
          }))
        });
      }

      // 6. Update Status to DONE
      const updated = await prisma.complianceCheck.update({
        where: { id: checkId },
        data: {
          status: 'DONE',
          productName: check.productName || productData.productName || result.productName || 'Товар',
          verdict: result.verdict,
          compliancePercent: result.compliancePercent,
          errorMessage: null
        },
        include: { items: true }
      });

      return updated;
    } catch (err: any) {
      console.error(`[ComplianceProcessor] Ошибка обработки проверки #${checkId}:`, err);

      await prisma.complianceCheck.update({
        where: { id: checkId },
        data: {
          status: 'FAILED',
          errorMessage: err?.message || 'Непредвиденная ошибка при анализе соответствия товара'
        }
      });

      throw err;
    }
  }
}
