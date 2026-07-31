import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { validateExportAccess } from '@/lib/security/subscription-guard';
import { INITIAL_TENDERS as mockTenders } from '@/lib/mockData';

export async function POST(request: NextRequest) {
  // 1. Enforce Subscription Authorization Guard
  const access = await validateExportAccess(request);
  if (!access.authorized && access.response) {
    return access.response;
  }

  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Empty body fallback
    }

    const {
      region,
      category,
      source,
      searchQuery,
      status,
      minAmount,
      maxAmount,
      tenderIds
    } = body;

    let tenders: any[] = [];

    // Fetch tenders from Prisma DB
    try {
      const whereClause: any = {};

      if (Array.isArray(tenderIds) && tenderIds.length > 0) {
        whereClause.id = { in: tenderIds };
      } else {
        if (region && region !== 'Все регионы') {
          whereClause.region = region;
        }
        if (category && category !== 'Все категории') {
          whereClause.category = category;
        }
        if (source && source !== 'Все') {
          whereClause.source = source;
        }
        if (status && status !== 'Все') {
          whereClause.status = status;
        }
        if (minAmount) {
          whereClause.amount = { ...whereClause.amount, gte: Number(minAmount) };
        }
        if (maxAmount) {
          whereClause.amount = { ...whereClause.amount, lte: Number(maxAmount) };
        }
        if (searchQuery && searchQuery.trim()) {
          whereClause.OR = [
            { title: { contains: searchQuery, mode: 'insensitive' } },
            { customerName: { contains: searchQuery, mode: 'insensitive' } },
            { externalId: { contains: searchQuery, mode: 'insensitive' } }
          ];
        }
      }

      tenders = await prisma.tender.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' }
      });
    } catch {
      tenders = [];
    }

    // Fallback to mock data if DB empty
    if (tenders.length === 0) {
      tenders = mockTenders.filter(t => {
        if (region && region !== 'Все регионы' && t.region !== region) return false;
        if (category && category !== 'Все категории' && t.category !== category) return false;
        if (source && source !== 'Все' && t.source !== source) return false;
        if (searchQuery && searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          if (!t.title.toLowerCase().includes(q) && !t.customerName.toLowerCase().includes(q) && !t.externalId.toLowerCase().includes(q)) return false;
        }
        return true;
      });
    }

    // Map tenders to clean tabular data rows
    const excelRows = tenders.map((t, idx) => ({
      '№': idx + 1,
      'Номер лота': t.externalId,
      'Наименование': t.title,
      'Заказчик': t.customerName,
      'БИН Заказчика': t.customerBin || '—',
      'Регион': t.region,
      'Сумма (KZT)': t.amount,
      'Обеспечение (KZT)': t.applicationSecurityAmount || 0,
      'Способ закупки': t.procurementMethod || 'OPEN_TENDER',
      'Дедлайн': t.deadlineDate ? new Date(t.deadlineDate).toISOString().split('T')[0] : '—',
      'Риск-индекс': t.riskScore || 0,
      'Источник': t.source,
      'Ссылка': t.sourceUrl
    }));

    // Create Excel Workbook
    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 5 },   // №
      { wch: 15 },  // Номер лота
      { wch: 45 },  // Наименование
      { wch: 35 },  // Заказчик
      { wch: 15 },  // БИН
      { wch: 18 },  // Регион
      { wch: 18 },  // Сумма
      { wch: 18 },  // Обеспечение
      { wch: 20 },  // Способ
      { wch: 14 },  // Дедлайн
      { wch: 12 },  // Риск
      { wch: 15 },  // Источник
      { wch: 40 }   // Ссылка
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Реестр тендеров');

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="tenders_export_${Date.now()}.xlsx"`
      }
    });
  } catch (error: any) {
    console.error('[API /api/export/tenders Error]:', error?.message);
    return NextResponse.json({ success: false, message: 'Ошибка формирования Excel-файла тендеров' }, { status: 500 });
  }
}
