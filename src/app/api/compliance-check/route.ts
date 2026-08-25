import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';
import { ComplianceProcessorService } from '@/lib/services/compliance-processor.service';
import { enqueueComplianceCheck } from '@/lib/queue/compliance.queue';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

export async function POST(request: NextRequest) {
  // 1. Mandatory Multi-Tenant Authentication Guard
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  try {
    // 2. Resolve Caller's Own Company Profile
    const companyProfile = await resolveOwnCompanyProfile(auth.userId);
    if (!companyProfile) {
      return NextResponse.json(
        { success: false, message: 'Профиль компании не найден. Сначала заполните профиль компании.' },
        { status: 404 }
      );
    }

    const contentType = request.headers.get('content-type') || '';

    let tzText = '';
    let tenderId: string | null = null;
    let sourceType: 'MANUAL_TEXT' | 'URL' | 'FILE' = 'MANUAL_TEXT';
    let sourceRaw: string | null = null;
    let sourceFileUrl: string | null = null;
    let llmTier: 'FREE' | 'PAID' = 'FREE';
    let fileBuffer: Buffer | undefined = undefined;

    // Handle Multipart Form Data (File Upload)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      tzText = (formData.get('tzText') as string) || '';
      tenderId = (formData.get('tenderId') as string) || null;
      sourceType = (formData.get('sourceType') as any) || 'FILE';
      sourceRaw = (formData.get('sourceRaw') as string) || null;
      llmTier = (formData.get('llmTier') as any) === 'PAID' ? 'PAID' : 'FREE';

      const file = formData.get('file') as File | null;
      if (file && file.size > 0) {
        if (file.size > MAX_FILE_SIZE) {
          return NextResponse.json(
            { success: false, message: `Размер файла (${Math.round(file.size / 1024 / 1024)} МБ) превышает лимит 15 МБ` },
            { status: 400 }
          );
        }

        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return NextResponse.json(
            { success: false, message: `Недопустимый формат файла .${ext}. Разрешены: ${ALLOWED_EXTENSIONS.join(', ')}` },
            { status: 400 }
          );
        }

        const arrayBuffer = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
        sourceFileUrl = file.name;
        sourceType = 'FILE';
      }
    } else {
      // Handle JSON Body
      const body = await request.json().catch(() => ({}));
      tzText = body.tzText || '';
      tenderId = body.tenderId || null;
      sourceType = body.sourceType || 'MANUAL_TEXT';
      sourceRaw = body.sourceRaw || null;
      sourceFileUrl = body.sourceFileUrl || null;
      llmTier = body.llmTier === 'PAID' ? 'PAID' : 'FREE';
    }

    if (!tzText || tzText.trim().length < 5) {
      return NextResponse.json(
        { success: false, message: 'Укажите текст технической спецификации (ТЗ)' },
        { status: 400 }
      );
    }

    if (sourceType === 'URL' && (!sourceRaw || !sourceRaw.trim())) {
      return NextResponse.json(
        { success: false, message: 'Укажите корректную ссылку на страницу товара' },
        { status: 400 }
      );
    }

    if (sourceType === 'MANUAL_TEXT' && (!sourceRaw || !sourceRaw.trim())) {
      return NextResponse.json(
        { success: false, message: 'Укажите характеристики товара' },
        { status: 400 }
      );
    }

    if (sourceType === 'FILE' && !fileBuffer && !sourceFileUrl) {
      return NextResponse.json(
        { success: false, message: 'Прикрепите файл спецификации товара (PDF или изображение)' },
        { status: 400 }
      );
    }

    // 3. Compute Content Hash for Deduplication / Caching
    const contentHash = ComplianceProcessorService.computeContentHash({
      tzText,
      sourceType,
      sourceRaw,
      sourceFileUrl,
      fileBuffer,
      llmTier
    });

    // 4. Create ComplianceCheck Record in DB (Status: PENDING)
    const check = await prisma.complianceCheck.create({
      data: {
        companyProfileId: companyProfile.id,
        tenderId: tenderId || undefined,
        sourceType: sourceType as any,
        sourceRaw: sourceRaw || undefined,
        sourceFileUrl: sourceFileUrl || undefined,
        tzText: tzText.trim(),
        llmTier: llmTier as any,
        status: 'PENDING',
        contentHash
      }
    });

    // 5. Enqueue Background Processing Task (BullMQ or in-process async)
    await enqueueComplianceCheck({
      checkId: check.id,
      fileBuffer
    });

    return NextResponse.json(
      {
        success: true,
        checkId: check.id,
        status: 'PENDING',
        contentHash,
        message: 'Проверка соответствия создана и поставлена в очередь обработки'
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('[API /api/compliance-check POST Error]:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Ошибка создания проверки соответствия' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // 1. Mandatory Multi-Tenant Authentication Guard
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  try {
    // 2. Resolve Caller's Own Company Profile
    const companyProfile = await resolveOwnCompanyProfile(auth.userId);
    if (!companyProfile) {
      return NextResponse.json(
        { success: false, message: 'Профиль компании не найден' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
    const tenderId = searchParams.get('tenderId');

    const whereClause: any = {
      companyProfileId: companyProfile.id
    };

    if (tenderId) {
      whereClause.tenderId = tenderId;
    }

    const [total, checks] = await Promise.all([
      prisma.complianceCheck.count({ where: whereClause }),
      prisma.complianceCheck.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          tender: {
            select: { id: true, externalId: true, title: true, customerName: true, amount: true }
          },
          _count: {
            select: { items: true }
          }
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      data: checks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err: any) {
    console.error('[API /api/compliance-check GET Error]:', err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Ошибка загрузки истории проверок' },
      { status: 500 }
    );
  }
}
