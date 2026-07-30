import { Tender } from '../types/tender';
import { prisma } from '../prisma';
import { DocumentExtractionService } from './document-extraction.service';
import { AIService } from './ai.service';
import { diffTenderFields } from '../ingestion/diff';

export class IngestionProcessorService {
  /**
   * Single unified processor for ingested tenders across background workers & manual HTTP API routes.
   * Pipeline:
   * 1. Extract text from attached specification documents (PDF/DOCX) via DocumentExtractionService.
   * 2. Generate LLM summary & risk score grounded on document text via AIService.
   * 3. Compute audit trail field deltas via diffTenderFields.
   * 4. Upsert Tender into PostgreSQL database.
   * 5. Upsert TenderDocument records with extractedText into PostgreSQL database.
   * 6. Create TenderAuditTrail records if fields changed.
   */
  static async processIngestedTenders(tenders: Tender[]): Promise<any[]> {
    if (!Array.isArray(tenders) || tenders.length === 0) {
      return [];
    }

    const savedTenders: any[] = [];

    for (const t of tenders) {
      try {
        let extractedDocTexts: string[] = [];

        // 1. Process attached specification documents & extract text
        if (Array.isArray(t.documents) && t.documents.length > 0) {
          for (const doc of t.documents) {
            if (doc.fileUrl) {
              try {
                const extracted = await DocumentExtractionService.extractTextFromDocumentUrl(doc.fileUrl);
                if (extracted) {
                  doc.extractedText = extracted;
                  extractedDocTexts.push(extracted);
                }
              } catch (docErr) {
                console.warn(`[IngestionProcessorService] Ошибка извлечения текста из файла '${doc.fileUrl}':`, docErr);
              }
            }
          }
        }

        const fullDocText = extractedDocTexts.join('\n\n');

        // 2. Generate AI summary & risk score grounded on document text
        let aiSummary = t.aiSummary;
        let aiKeyRequirements = t.aiKeyRequirements || [];
        let riskScore = t.riskScore || 0;

        try {
          const aiAnalysis = await AIService.generateLLMSummary(t, fullDocText);
          if (aiAnalysis) {
            aiSummary = aiAnalysis.summary;
            aiKeyRequirements = aiAnalysis.requirements;
            riskScore = aiAnalysis.riskScore;
          }
        } catch (aiErr) {
          console.warn(`[IngestionProcessorService] Ошибка AI-суммаризации для лота #${t.externalId}:`, aiErr);
        }

        // 3. Persist into PostgreSQL Database (if DB connection is available)
        try {
          const existing = await prisma.tender.findUnique({
            where: {
              source_externalId: {
                source: t.source,
                externalId: t.externalId
              }
            }
          });

          let auditLogsToCreate: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
          if (existing) {
            auditLogsToCreate = diffTenderFields(existing, t);
          }

          // 4. Upsert Tender in Prisma DB
          const savedTender = await prisma.tender.upsert({
            where: {
              source_externalId: {
                source: t.source,
                externalId: t.externalId
              }
            },
            update: {
              title: t.title,
              description: t.description || '',
              customerName: t.customerName,
              customerBin: t.customerBin,
              category: t.category,
              industryTags: t.industryTags || [],
              amount: t.amount,
              currency: t.currency || 'KZT',
              region: t.region,
              publishDate: new Date(t.publishDate),
              deadlineDate: new Date(t.deadlineDate),
              applicationSecurityAmount: t.applicationSecurityAmount,
              applicationSecurityPercent: t.applicationSecurityPercent,
              sourceUrl: t.sourceUrl,
              aiSummary,
              aiKeyRequirements,
              riskScore
            },
            create: {
              source: t.source,
              externalId: t.externalId,
              title: t.title,
              description: t.description || '',
              customerName: t.customerName,
              customerBin: t.customerBin,
              category: t.category,
              industryTags: t.industryTags || [],
              amount: t.amount,
              currency: t.currency || 'KZT',
              region: t.region,
              publishDate: new Date(t.publishDate),
              deadlineDate: new Date(t.deadlineDate),
              applicationSecurityAmount: t.applicationSecurityAmount,
              applicationSecurityPercent: t.applicationSecurityPercent,
              sourceUrl: t.sourceUrl,
              aiSummary,
              aiKeyRequirements,
              riskScore
            }
          });

          // 5. Upsert TenderDocument records with extractedText in Prisma DB
          if (Array.isArray(t.documents) && t.documents.length > 0) {
            for (const doc of t.documents) {
              if (doc.fileUrl) {
                const existingDoc = await prisma.tenderDocument.findFirst({
                  where: { tenderId: savedTender.id, fileUrl: doc.fileUrl }
                });

                if (existingDoc) {
                  await prisma.tenderDocument.update({
                    where: { id: existingDoc.id },
                    data: {
                      fileName: doc.fileName || 'ТЗ.pdf',
                      fileSize: doc.fileSize,
                      docType: doc.docType || 'TECHNICAL_SPEC',
                      extractedText: doc.extractedText || existingDoc.extractedText
                    }
                  });
                } else {
                  await prisma.tenderDocument.create({
                    data: {
                      tenderId: savedTender.id,
                      fileName: doc.fileName || 'ТЗ.pdf',
                      fileUrl: doc.fileUrl,
                      fileSize: doc.fileSize,
                      docType: doc.docType || 'TECHNICAL_SPEC',
                      extractedText: doc.extractedText || null
                    }
                  });
                }
              }
            }
          }

          // 6. Save audit trail logs if fields changed
          if (existing && auditLogsToCreate.length > 0) {
            await prisma.tenderAuditTrail.createMany({
              data: auditLogsToCreate.map(change => ({
                tenderId: savedTender.id,
                field: change.field,
                oldValue: change.oldValue,
                newValue: change.newValue,
                changedBy: 'System Parser'
              }))
            });
          }

          savedTenders.push(savedTender);
        } catch (dbErr: any) {
          console.warn(`[IngestionProcessorService] БД недоступна для персистентности лота #${t.externalId}: ${dbErr?.message || dbErr}`);
          savedTenders.push({ ...t, aiSummary, aiKeyRequirements, riskScore });
        }
      } catch (err) {
        console.error(`[IngestionProcessorService] Ошибка обработки лота #${t.externalId}:`, err);
      }
    }

    return savedTenders;
  }
}
