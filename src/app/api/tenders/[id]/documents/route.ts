import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = validateApiAuth(request);
  const tenderId = params.id;

  try {
    const docs = await prisma.generatedDocument.findMany({
      where: { tenderId },
      include: {
        template: { select: { name: true, category: true, outputFormat: true } },
        companyProfile: { select: { companyName: true, bin: true } }
      },
      orderBy: { generatedAt: 'desc' }
    });

    return NextResponse.json({ success: true, documents: docs });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/documents GET Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка загрузки сгенерированных документов' },
      { status: 500 }
    );
  }
}
