import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DocGeneratorService } from '@/lib/services/doc-generator.service';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get('docId');
  const tenderId = params.id;

  try {
    if (!docId) {
      return NextResponse.json({ success: false, message: 'Укажите docId' }, { status: 400 });
    }

    const genDoc = await prisma.generatedDocument.findUnique({
      where: { id: docId },
      include: {
        template: true,
        tender: true,
        companyProfile: true
      }
    });

    if (!genDoc || genDoc.tenderId !== tenderId) {
      return NextResponse.json({ success: false, message: 'Документ не найден' }, { status: 404 });
    }

    const resolvedText = DocGeneratorService.resolvePlaceholders(
      genDoc.template.bodyTemplate,
      genDoc.tender,
      genDoc.companyProfile
    );

    const docxBuffer = await DocGeneratorService.generateDocxBuffer(genDoc.template.name, resolvedText);

    const safeFilename = encodeURIComponent(`${genDoc.template.name}_${genDoc.tender.externalId}.docx`);

    return new NextResponse(docxBuffer, {
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
