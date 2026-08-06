import { Tender } from '../types/tender';
import { prisma } from '../prisma';
import { DocumentExtractionService } from './document-extraction.service';
import { AIService } from './ai.service';
import { ReputationService } from './reputation.service';
import { diffTenderFields } from '../ingestion/diff';

export class IngestionProcessorService {
  /**
   * Single unified processor for ingested tenders across background workers & manual HTTP API routes.
   * Pipeline:
   * 1. Extract text from attached specification documents (PDF/DOCX) via DocumentExtractionService.
   * 2. Generate LLM summary & risk score grounded on document text via AIService.
   * 2.1 Check Customer reputation against Goszakup RNU (РНУ ГЗ).
   * 3. Compute audit trail field deltas via diffTenderFields.
   * 4. Upsert Tender into PostgreSQL database.
   * 5. Upsert TenderDocument & RiskFlag records into PostgreSQL database.
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
        let riskScoringStatus = t.riskScoringStatus || 'DEFAULT_ADAPTER';
        let riskFlags = [...(t.riskFlags || [])];

        try {
          const aiAnalysis = await AIService.generateLLMSummary(t, fullDocText);
          if (aiAnalysis) {
            aiSummary = aiAnalysis.summary;
            aiKeyRequirements = aiAnalysis.requirements;
            riskScore = aiAnalysis.riskScore;
            riskScoringStatus = 'AI_SCORED';
          }
        } catch (aiErr) {
          console.warn(`[IngestionProcessorService] Ошибка AI-суммаризации для лота #${t.externalId}:`, aiErr);
        }

        // 2.1 Check Customer Reputation against Goszakup RNU (РНУ ГЗ)
        if (t.customerBin && ReputationService.isValidBin(t.customerBin)) {
          try {
            const repCheck = await ReputationService.checkBin(t.customerBin, 'CUSTOMER');
            if (repCheck && repCheck.isBlacklisted) {
              const alreadyHasFlag = riskFlags.some(f => f.code === 'CUSTOMER_BLACKLISTED' || f.title.includes('недобросовестных'));
              if (!alreadyHasFlag) {
                riskFlags.push({
                  id: `rf-rnu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                  code: 'CUSTOMER_BLACKLISTED',
                  severity: 'CRITICAL',
                  title: 'Заказчик в реестре недобросовестных участников',
                  description: repCheck.reason || 'Заказчик числится в Реестре недобросовестных участников Госзакупок'
                });
              }
              riskScore = Math.min(100, riskScore + 30);
            }
          } catch (repErr) {
            console.warn(`[IngestionProcessorService] Ошибка проверки РНУ для БИН ${t.customerBin}:`, repErr);
          }
        }

        t.riskFlags = riskFlags;
        t.riskScore = riskScore;

        // 3. Persist into PostgreSQL Database atomically via prisma.$transaction (Bug #18)
        try {
          const savedTender = await prisma.$transaction(async (tx) => {
            const existing = await tx.tender.findUnique({
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
            const tender = await tx.tender.upsert({
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
                riskScore,
                riskScoringStatus
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
                riskScore,
                riskScoringStatus
              }
            });

            // 5. Upsert TenderDocument records with extractedText in Prisma DB
            if (Array.isArray(t.documents) && t.documents.length > 0) {
              for (const doc of t.documents) {
                if (doc.fileUrl) {
                  const existingDoc = await tx.tenderDocument.findFirst({
                    where: { tenderId: tender.id, fileUrl: doc.fileUrl }
                  });

                  if (existingDoc) {
                    await tx.tenderDocument.update({
                      where: { id: existingDoc.id },
                      data: {
                        fileName: doc.fileName || 'ТЗ.pdf',
                        fileSize: doc.fileSize,
                        docType: doc.docType || 'TECHNICAL_SPEC',
                        extractedText: doc.extractedText || existingDoc.extractedText
                      }
                    });
                  } else {
                    await tx.tenderDocument.create({
                      data: {
                        tenderId: tender.id,
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

            // 5.1 Save RiskFlags atomically
            if (Array.isArray(riskFlags) && riskFlags.length > 0) {
              for (const rf of riskFlags) {
                const existingRf = await tx.riskFlag.findFirst({
                  where: { tenderId: tender.id, title: rf.title }
                });
                if (!existingRf) {
                  await tx.riskFlag.create({
                    data: {
                      tenderId: tender.id,
                      title: rf.title,
                      description: rf.description,
                      severity: rf.severity || 'MEDIUM'
                    }
                  });
                }
              }
            }

            // 6. Save audit trail logs atomically if fields changed
            if (existing && auditLogsToCreate.length > 0) {
              await tx.tenderAuditTrail.createMany({
                data: auditLogsToCreate.map(change => ({
                  tenderId: tender.id,
                  field: change.field,
                  oldValue: change.oldValue,
                  newValue: change.newValue,
                  changedBy: 'System Parser'
                }))
              });
            }

            return tender;
          });

          savedTenders.push(savedTender);
        } catch (dbErr: any) {
          console.warn(`[IngestionProcessorService] БД недоступна для персистентности лота #${t.externalId}: ${dbErr?.message || dbErr}`);
          savedTenders.push({ ...t, id: t.id || `t-${t.externalId}`, aiSummary, aiKeyRequirements, riskScore });
        }
      } catch (err) {
        console.error(`[IngestionProcessorService] Ошибка обработки лота #${t.externalId}:`, err);
      }
    }

    return savedTenders;
  }
}
