import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';

const DEFAULT_TEMPLATES = [
  {
    name: 'Доверенность на участие в тендере',
    category: 'ALL',
    bodyTemplate: `ДОВЕРЕННОСТЬ

г. Астана                                                                Дата: {{today}}

Настоящим ТОО "{{companyName}}" (БИН: {{bin}}) уполномачивает представителя представлять интересы компании при участии в закупках по лоту № {{tenderTitle}}, проводимых заказчиком {{customerName}}.

Сумма заявки составляет: {{tenderAmount}} ₸.

Настоящая доверенность действительна до {{deadlineDate}}.

Руководитель ТОО "{{companyName}}": ___________________ (Подпись)`
  },
  {
    name: 'Гарантийное письмо о соблюдении условий ТЗ',
    category: 'ALL',
    bodyTemplate: `ГАРАНТИЙНОЕ ПИСЬМО

Настоящим ТОО "{{companyName}}" (БИН: {{bin}}) гарантирует полную и своевременную поставку товаров / выполнение работ по тендеру "{{tenderTitle}}" для Заказчика {{customerName}}.

Подтверждаем согласие с начальной суммой {{tenderAmount}} ₸ и обязательствами по дедлайну {{deadlineDate}}.

Дата: {{today}}
Руководитель: ___________________`
  }
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  try {
    let templates = await prisma.documentTemplate.findMany({
      where: category && category !== 'ALL' ? {
        OR: [
          { category: category },
          { category: 'ALL' }
        ]
      } : {},
      orderBy: { createdAt: 'asc' }
    });

    // Seed default templates if database is empty
    if (templates.length === 0) {
      await prisma.documentTemplate.createMany({
        data: DEFAULT_TEMPLATES
      });

      templates = await prisma.documentTemplate.findMany({
        orderBy: { createdAt: 'asc' }
      });
    }

    return NextResponse.json({ success: true, templates });
  } catch (error: any) {
    console.error('[API /api/documents/templates GET Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка загрузки шаблонов документов' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  try {
    const body = await request.json();
    const { id, name, category, bodyTemplate, outputFormat } = body;

    if (!name || !bodyTemplate) {
      return NextResponse.json(
        { success: false, message: 'Укажите название и текст шаблона' },
        { status: 400 }
      );
    }

    let template;
    if (id) {
      template = await prisma.documentTemplate.update({
        where: { id },
        data: {
          name: name.trim(),
          category: category || 'ALL',
          bodyTemplate: bodyTemplate.trim(),
          outputFormat: outputFormat || 'DOCX'
        }
      });
    } else {
      template = await prisma.documentTemplate.create({
        data: {
          name: name.trim(),
          category: category || 'ALL',
          bodyTemplate: bodyTemplate.trim(),
          outputFormat: outputFormat || 'DOCX'
        }
      });
    }

    return NextResponse.json({ success: true, template });
  } catch (error: any) {
    console.error('[API /api/documents/templates POST Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка сохранения шаблона' },
      { status: 500 }
    );
  }
}
