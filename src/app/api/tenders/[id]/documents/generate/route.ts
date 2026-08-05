import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';
import { DocGeneratorService } from '@/lib/services/doc-generator.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) return auth.response;

  const tenderId = params.id;

  try {
    const companyProfile = await resolveOwnCompanyProfile(auth.userId);

    if (!companyProfile) {
      return NextResponse.json(
        { success: false, message: 'Профиль компании не найден. Сначала заполните профиль компании.' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { templateId } = body;

    if (!templateId) {
      return NextResponse.json({ success: false, message: 'Укажите templateId шаблона' }, { status: 400 });
    }

    const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
    if (!tender) {
      return NextResponse.json({ success: false, message: 'Тендер не найден' }, { status: 404 });
    }

    const template = await prisma.documentTemplate.findUnique({ where: { id: templateId } });
    if (!template) {
      return NextResponse.json({ success: false, message: 'Шаблон документа не найден' }, { status: 404 });
    }

    // Resolve Placeholders
    const resolvedBodyText = DocGeneratorService.resolvePlaceholders(template.bodyTemplate, tender, companyProfile);

    // Create record first to get ID
    const genDoc = await prisma.generatedDocument.create({
      data: {
        tenderId,
        templateId,
        companyProfileId: companyProfile.id,
        fileUrl: `/api/tenders/${tenderId}/documents/download`
      }
    });

    // Update download URL with exact doc ID
    const fileUrl = `/api/tenders/${tenderId}/documents/download?docId=${genDoc.id}`;
    const updatedDoc = await prisma.generatedDocument.update({
      where: { id: genDoc.id },
      data: { fileUrl },
      include: { template: true }
    });

    return NextResponse.json({
      success: true,
      document: updatedDoc,
      fileUrl,
      resolvedText: resolvedBodyText
    });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/documents/generate Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка генерации документа' },
      { status: 500 }
    );
  }
}
