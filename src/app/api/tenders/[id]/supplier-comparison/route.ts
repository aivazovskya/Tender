import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/security/auth';
import { SupplierComparisonService } from '@/lib/services/supplier-comparison.service';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiAuth(request);
  const tenderId = params.id;

  if (!tenderId) {
    return NextResponse.json({ success: false, error: 'Параметр tenderId обязателен' }, { status: 400 });
  }

  try {
    const data = await SupplierComparisonService.getOrCreateComparison(tenderId, auth.userId);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/supplier-comparison GET Error]:', error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || 'Ошибка загрузки конкурентного листа' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateApiAuth(request);
  const tenderId = params.id;

  if (!tenderId) {
    return NextResponse.json({ success: false, error: 'Параметр tenderId обязателен' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const data = await SupplierComparisonService.saveComparison(tenderId, auth.userId, body);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/supplier-comparison POST Error]:', error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || 'Ошибка сохранения конкурентного листа' },
      { status: 500 }
    );
  }
}
