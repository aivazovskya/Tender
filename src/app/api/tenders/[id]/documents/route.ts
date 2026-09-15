import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  const tenderId = params.id;

  try {
    const whereClause: any = { tenderId };

    if (auth.role !== 'ADMIN' && !auth.userId.startsWith('admin-')) {
      const companyProfile = await resolveOwnCompanyProfile(auth.userId);
      if (!companyProfile) {
        return NextResponse.json({ success: true, documents: [] });
      }
      whereClause.companyProfileId = companyProfile.id;
    }

    const docs = await prisma.generatedDocument.findMany({
      where: whereClause,
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
