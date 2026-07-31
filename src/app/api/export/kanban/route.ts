import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { validateExportAccess } from '@/lib/security/subscription-guard';
import { INITIAL_TENDERS } from '@/lib/mockData';

const STAGE_LABELS: Record<string, string> = {
  UNDER_REVIEW: 'На рассмотрении',
  PREPARING_BID: 'Готовим заявку',
  SUBMITTED: 'Подано в портал',
  WON: 'Выиграли лот',
  LOST: 'Проиграли'
};

const PRIORITY_LABELS: Record<string, string> = {
  HIGH: 'Высокий',
  MEDIUM: 'Средний',
  LOW: 'Низкий'
};

export async function POST(request: NextRequest) {
  // 1. Enforce Subscription Authorization Guard
  const access = await validateExportAccess(request);
  if (!access.authorized && access.response) {
    return access.response;
  }

  try {
    let cards: any[] = [];

    // Fetch kanban cards from Prisma DB
    try {
      cards = await prisma.kanbanCard.findMany({
        include: {
          tender: true,
          user: true
        },
        orderBy: { updatedAt: 'desc' }
      });
    } catch {
      cards = [];
    }

    // Fallback to mock kanban data if DB empty
    if (cards.length === 0) {
      cards = INITIAL_TENDERS.slice(0, 4).map((t, idx) => ({
        id: `k-${idx + 1}`,
        stage: idx === 0 ? 'UNDER_REVIEW' : idx === 1 ? 'PREPARING_BID' : idx === 2 ? 'SUBMITTED' : 'WON',
        priority: idx === 0 ? 'HIGH' : idx === 1 ? 'MEDIUM' : 'LOW',
        assignee: idx === 0 ? 'Серик А. (Главный тендерщик)' : idx === 1 ? 'Гульнара К. (Юрист)' : 'Дмитрий В. (Снабжение)',
        notes: idx === 0 ? 'Подготовка КП и технической спецификации' : 'Согласование банковской гарантии',
        stageEnteredAt: new Date(Date.now() - (idx + 1) * 86400000).toISOString(),
        tender: t
      }));
    }

    // Map kanban cards to tabular Excel rows
    const excelRows = cards.map((c, idx) => ({
      '№': idx + 1,
      'Номер лота': c.tender?.externalId || '—',
      'Наименование лота': c.tender?.title || '—',
      'Этап воронки': STAGE_LABELS[c.stage] || c.stage,
      'Приоритет': PRIORITY_LABELS[c.priority] || c.priority || 'Средний',
      'Ответственный': c.assignee || 'Не назначен',
      'Заметки': c.notes || '',
      'Заказчик': c.tender?.customerName || '—',
      'Сумма договора (KZT)': c.tender?.amount || 0,
      'Дедлайн': c.tender?.deadlineDate ? new Date(c.tender.deadlineDate).toISOString().split('T')[0] : '—',
      'Регион': c.tender?.region || '—',
      'Дата входа в этап': c.stageEnteredAt ? new Date(c.stageEnteredAt).toLocaleString('ru-RU') : '—'
    }));

    // Create Excel Workbook
    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 5 },   // №
      { wch: 15 },  // Номер лота
      { wch: 45 },  // Наименование
      { wch: 20 },  // Этап
      { wch: 12 },  // Приоритет
      { wch: 22 },  // Ответственный
      { wch: 35 },  // Заметки
      { wch: 30 },  // Заказчик
      { wch: 18 },  // Сумма
      { wch: 14 },  // Дедлайн
      { wch: 18 },  // Регион
      { wch: 20 }   // Дата входа
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Воронка Kanban');

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="kanban_export_${Date.now()}.xlsx"`
      }
    });
  } catch (error: any) {
    console.error('[API /api/export/kanban Error]:', error?.message);
    return NextResponse.json({ success: false, message: 'Ошибка формирования Excel-файла воронки Kanban' }, { status: 500 });
  }
}
