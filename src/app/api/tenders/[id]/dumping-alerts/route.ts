import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { AntiDumpingService } from '@/lib/services/anti-dumping.service';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await validateApiAuth(request, 'USER');
    if (!auth.authorized) {
      return auth.response || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenderId = params.id;
    let tender: any = null;
    let alerts: any[] = [];

    try {
      tender = await prisma.tender.findUnique({
        where: { id: tenderId },
        select: {
          id: true,
          source: true,
          procurementMethod: true,
          title: true,
          amount: true,
          category: true,
          industryTags: true
        }
      });
    } catch (dbErr: any) {
      console.warn(`[API /api/tenders/[id]/dumping-alerts] DB error:`, dbErr?.message);
    }

    if (!tender) {
      return NextResponse.json({ success: false, error: 'Tender not found' }, { status: 404 });
    }

    try {
      alerts = await (prisma as any).dumpingAlert.findMany({
        where: { tenderId },
        orderBy: { triggeredAt: 'desc' }
      });
    } catch {
      alerts = [];
    }

    const thresholdInfo = await AntiDumpingService.resolveThreshold(tender);

    return NextResponse.json({
      success: true,
      tenderId,
      applicableThreshold: thresholdInfo,
      alerts,
      count: alerts.length
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await validateApiAuth(request, 'USER');
    if (!auth.authorized) {
      return auth.response || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenderId = params.id;
    const body = await request.json();
    const currentPrice = Number(body.currentPrice);
    const referencePrice = Number(body.referencePrice);

    if (!currentPrice || currentPrice <= 0) {
      return NextResponse.json({ success: false, error: 'Valid currentPrice is required' }, { status: 400 });
    }

    const tender = await prisma.tender.findUnique({
      where: { id: tenderId }
    });

    if (!tender) {
      return NextResponse.json({ success: false, error: 'Tender not found' }, { status: 404 });
    }

    const effectiveRefPrice = referencePrice > 0 ? referencePrice : Number(tender.amount);
    const callerProfile = auth.userId ? await resolveOwnCompanyProfile(auth.userId) : null;
    const result = await AntiDumpingService.checkDumping(
      tender,
      currentPrice,
      effectiveRefPrice,
      {
        subjectType: body.subjectType,
        notes: body.notes,
        chatIds: callerProfile?.telegramChatId ? [callerProfile.telegramChatId] : undefined
      }
    );

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}