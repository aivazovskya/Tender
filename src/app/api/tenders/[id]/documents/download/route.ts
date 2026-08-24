import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { DocGeneratorService } from '@/lib/services/doc-generator.service';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const docId = searchParams.get('docId');
  const tenderId = params.id;

  try {
    if (!docId) {
      return NextResponse.json({ success: false, message: 'Укажите docId' }, { status: 400 });
    }

    let genDoc: any = null;
    try {
      genDoc = await prisma.generatedDocument.findUnique({
        where: { id: docId },
        include: {
          template: true,
          tender: true,
          companyProfile: true
        }
      });
    } catch (dbErr) {
      genDoc = null;
    }

    if (!genDoc || genDoc.tenderId !== tenderId) {
      return NextResponse.json({ success: false, message: 'Документ не найден' }, { status: 404 });
    }

    // Verify document belongs to the authenticated user's company profile (or system ADMIN)
    const isOwner = genDoc.companyProfile && genDoc.companyProfile.userId === auth.userId;
    const isAdmin = auth.role === 'ADMIN' || auth.userId.startsWith('admin-');

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { success: false, message: 'Forbidden: У вас нет прав на скачивание этого документа' },
        { status: 403 }
      );
    }

    const resolvedText = DocGeneratorService.resolvePlaceholders(
      genDoc.template.bodyTemplate,
      genDoc.tender,
      genDoc.companyProfile
    );

    const docxBuffer = await DocGeneratorService.generateDocxBuffer(genDoc.template.name, resolvedText);

    const safeFilename = encodeURIComponent(`${genDoc.template.name}_${genDoc.tender.externalId}.docx`);

    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`
      }
    });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/documents/download Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка скачивания файла' },
      { status: 500 }
    );
  }
}
