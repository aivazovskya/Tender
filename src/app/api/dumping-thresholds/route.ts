import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { AntiDumpingService } from '@/lib/services/anti-dumping.service';
import { DEFAULT_DUMPING_THRESHOLDS } from '@/lib/types/tender';

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiAuth(request, 'USER');
    if (!auth.authorized) {
      return auth.response || NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let thresholds: any[] = [];
    try {
      await AntiDumpingService.seedDefaultThresholds();
      thresholds = await (prisma as any).dumpingThreshold.findMany({
        orderBy: [{ source: 'asc' }, { procurementMethod: 'asc' }]
      });
    } catch {
      thresholds = DEFAULT_DUMPING_THRESHOLDS;
    }

    return NextResponse.json({
      success: true,
      data: thresholds,
      count: thresholds.length
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}