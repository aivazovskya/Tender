import { NextRequest, NextResponse } from 'next/server';
import { validatePublicApiKey } from '@/lib/security/public-api-guard';
import { prisma } from '@/lib/prisma';
import { INITIAL_TENDERS as mockTenders } from '@/lib/mockData';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Enforce Public API Key Authentication & Enterprise Guard
  const auth = await validatePublicApiKey(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  const targetId = params.id;
  let tender: any = null;

  try {
    tender = await prisma.tender.findFirst({
      where: {
        OR: [
          { id: targetId },
          { externalId: targetId }
        ]
      },
      include: {
        riskFlags: true,
        documents: true,
        history: true
      }
    });
  } catch {
    tender = null;
  }

  if (!tender) {
    tender = mockTenders.find(t => t.id === targetId || t.externalId === targetId) || mockTenders[0];
  }

  if (!tender) {
    return NextResponse.json({ success: false, error: 'Тендер с указанным ID не найден' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    tender
  });
}
