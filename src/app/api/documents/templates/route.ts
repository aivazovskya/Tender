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
  },
  {
    name: 'Форма соответствия требованиям ТЗ (Техническая спецификация)',
    category: 'ALL',
    bodyTemplate: `ТЕХНИЧЕСКАЯ СПЕЦИФИКАЦИЯ
(Форма подтверждения соответствия требованиям Заказчика)

к закупке: "{{tenderTitle}}"
Заказчик: {{customerName}}
Потенциальный поставщик: ТОО "{{companyName}}" (БИН: {{bin}})

1. ОБЩИЕ СВЕДЕНИЯ И ЦЕНОВОЕ ПРЕДЛОЖЕНИЕ
Настоящим ТОО "{{companyName}}" подтверждает готовность осуществить поставку товаров / выполнение работ / оказание услуг в полном соответствии с требованиями конкурсной документации и технической спецификации Заказчика.

Срок действия заявки: до {{deadlineDate}}.
{{commercialOffer}}

2. ПОДТВЕРЖДЕНИЕ СООТВЕТСТВИЯ ТРЕБОВАНИЯМ ТЕХНИЧЕСКОЙ СПЕЦИФИКАЦИИ
Ниже приведено постатейное подтверждение соответствия установленным квалификационным и техническим требованиям Заказчика:

{{requirementsList}}

3. ГАРАНТИЙНЫЕ ОБЯЗАТЕЛЬСТВА
ТОО "{{companyName}}" гарантирует достоверность предоставленных сведений, качество поставляемых товаров/услуг, соблюдение сроков поставки и требований законодательства Республики Казахстан.

Дата: {{today}}
Руководитель ТОО "{{companyName}}": ___________________ / {{companyName}} /
М.П.`
  }
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  try {
    // Ensure all default templates exist in database
    try {
      const allTemplates = await prisma.documentTemplate.findMany();
      const existingNames = new Set(allTemplates.map(t => t.name));
      const missing = DEFAULT_TEMPLATES.filter(t => !existingNames.has(t.name));

      if (missing.length > 0) {
        for (const tpl of missing) {
          try {
            await prisma.documentTemplate.create({ data: tpl });
          } catch {
            // Ignore potential concurrent create conflict
          }
        }
      }
    } catch (seedErr: any) {
      console.warn('[API /api/documents/templates seed warning]:', seedErr?.message);
    }

    const templates = await prisma.documentTemplate.findMany({
      where: category && category !== 'ALL' ? {
        OR: [
          { category: category },
          { category: 'ALL' }
        ]
      } : {},
      orderBy: { createdAt: 'asc' }
    });

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
