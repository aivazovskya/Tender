import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { validateExportAccess } from '@/lib/security/subscription-guard';
import { INITIAL_TENDERS as mockTenders } from '@/lib/mockData';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Enforce Subscription Authorization Guard
  const access = await validateExportAccess(request);
  if (!access.authorized && access.response) {
    return access.response;
  }

  try {
    const tenderId = params.id;
    let tender: any = null;

    // Fetch tender from Prisma DB
    try {
      tender = await prisma.tender.findFirst({
        where: {
          OR: [{ id: tenderId }, { externalId: tenderId }]
        },
        include: {
          documents: true,
          riskFlags: true,
          history: true
        }
      });
    } catch {
      tender = null;
    }

    // Fallback to mock data if DB missing target tender
    if (!tender) {
      tender = mockTenders.find((t) => t.id === tenderId || t.externalId === tenderId) || mockTenders[0];
    }

    if (!tender) {
      return NextResponse.json({ success: false, message: `Тендер с ID '${tenderId}' не найден` }, { status: 404 });
    }

    // Generate PDF Document
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'noto-sans.ttf');
    const fontBoldPath = path.join(process.cwd(), 'public', 'fonts', 'noto-sans-bold.ttf');

    let fontLoaded = false;
    let boldFontLoaded = false;

    if (fs.existsSync(fontPath)) {
      doc.registerFont('CyrillicFont', fontPath);
      doc.font('CyrillicFont');
      fontLoaded = true;
    }
    if (fs.existsSync(fontBoldPath)) {
      doc.registerFont('CyrillicFont-Bold', fontBoldPath);
      boldFontLoaded = true;
    }

    const setHeaderFont = () => {
      if (boldFontLoaded) doc.font('CyrillicFont-Bold');
      else if (fontLoaded) doc.font('CyrillicFont');
    };

    const setBodyFont = () => {
      if (fontLoaded) doc.font('CyrillicFont');
    };

    // Header Banner
    setHeaderFont();
    doc.fillColor('#1E293B').fontSize(16).text(`ТЕНДЕРНЫЙ ОТЧЕТ ИИ-АНАЛИТИКИ (TenderAI)`, { align: 'center' });
    doc.moveDown(0.3);
    setBodyFont();
    doc.fillColor('#64748B').fontSize(9).text(`Сформировано: ${new Date().toLocaleString('ru-RU')} • Тариф: ${access.plan}`, { align: 'center' });
    doc.moveDown(1);

    // Main Lot Information
    setHeaderFont();
    doc.fillColor('#0F172A').fontSize(14).text(`Лот №${tender.externalId}: ${tender.title}`);
    doc.moveDown(0.5);

    setBodyFont();
    doc.fontSize(10).fillColor('#334155');
    doc.text(`🏛️ Заказчик: ${tender.customerName} (БИН: ${tender.customerBin || '—'})`);
    doc.text(`📍 Регион: ${tender.region}`);
    doc.text(`💰 Сумма договора: ${tender.amount.toLocaleString('ru-RU')} KZT (${tender.currency || 'KZT'})`);
    if (tender.applicationSecurityAmount) {
      doc.text(`🛡️ Обеспечение заявки: ${tender.applicationSecurityAmount.toLocaleString('ru-RU')} KZT (${tender.applicationSecurityPercent || 1}%)`);
    }
    doc.text(`⏳ Дедлайн подачи: ${new Date(tender.deadlineDate).toLocaleDateString('ru-RU')}`);
    doc.text(`📌 Способ закупки: ${tender.procurementMethod || 'Открытый конкурс'}`);
    doc.text(`🌐 Источник: ${tender.source} (${tender.sourceUrl})`);
    doc.moveDown(1);

    // AI Summary Section
    setHeaderFont();
    doc.fillColor('#0F172A').fontSize(12).text('🤖 ИИ-Суммаризация и требования:', { underline: true });
    doc.moveDown(0.3);
    setBodyFont();
    doc.fontSize(10).fillColor('#1E293B').text(tender.aiSummary || 'Автоматическое ИИ-резюме лота не сгенерировано.');
    doc.moveDown(0.5);

    if (Array.isArray(tender.aiKeyRequirements) && tender.aiKeyRequirements.length > 0) {
      setHeaderFont();
      doc.fontSize(10).fillColor('#0F172A').text('Ключевые квалификационные требования к поставщику:');
      setBodyFont();
      tender.aiKeyRequirements.forEach((req: string, idx: number) => {
        doc.fontSize(9.5).fillColor('#334155').text(`  ${idx + 1}. ${req}`);
      });
    }
    doc.moveDown(1);

    // Risk Assessment Section
    const riskScore = tender.riskScore || 0;
    let riskBadge = 'Төмен / Низкий риск';
    if (riskScore > 60) riskBadge = 'Жоғары / Высокий риск (Внимание!)';
    else if (riskScore > 25) riskBadge = 'Орташа / Средний риск';

    setHeaderFont();
    doc.fillColor('#0F172A').fontSize(12).text('📊 Анализ рисков участия:', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor(riskScore > 60 ? '#B91C1C' : riskScore > 25 ? '#B45309' : '#047857');
    doc.text(`Индекс риска: ${riskScore} / 100 — ${riskBadge}`);
    doc.moveDown(0.5);

    if (Array.isArray(tender.riskFlags) && tender.riskFlags.length > 0) {
      setHeaderFont();
      doc.fontSize(10).fillColor('#0F172A').text('Обнаруженные риск-факторы:');
      setBodyFont();
      tender.riskFlags.forEach((rf: any, idx: number) => {
        doc.fontSize(9.5).fillColor('#475569').text(`  • [${rf.severity || 'MEDIUM'}] ${rf.title}: ${rf.description}`);
      });
    } else {
      setBodyFont();
      doc.fontSize(9.5).fillColor('#64748B').text('Критичные аномалии в условиях лота не зафиксированы.');
    }
    doc.moveDown(1);

    // Documents Section
    setHeaderFont();
    doc.fillColor('#0F172A').fontSize(12).text('📎 Приложенные документы лота:', { underline: true });
    doc.moveDown(0.3);
    setBodyFont();
    if (Array.isArray(tender.documents) && tender.documents.length > 0) {
      tender.documents.forEach((d: any, idx: number) => {
        doc.fontSize(9.5).fillColor('#334155').text(`  ${idx + 1}. ${d.fileName} (${d.docType || 'Техспецификация'}) — ${d.fileUrl}`);
      });
    } else {
      doc.fontSize(9.5).fillColor('#64748B').text('Документы доступны по прямой ссылке на портале источника.');
    }

    doc.moveDown(2);
    setBodyFont();
    doc.fontSize(8).fillColor('#94A3B8').text('Сгенерировано платформой TenderAI Kazakhstan (https://tenderai.kz). Данный отчёт предназначен для внутреннего использования.', { align: 'center' });

    doc.end();

    await new Promise((resolve) => doc.on('end', resolve));

    const pdfBuffer = Buffer.concat(chunks);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="tender_report_${tender.externalId}.pdf"`
      }
    });
  } catch (error: any) {
    console.error('[API /api/export/tenders/[id]/pdf Error]:', error?.message);
    return NextResponse.json({ success: false, message: 'Ошибка формирования PDF-отчета' }, { status: 500 });
  }
}
