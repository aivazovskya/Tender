import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/security/auth';
import { SupplierComparisonService } from '@/lib/services/supplier-comparison.service';
import { SupplierComparisonExcelService } from '@/lib/services/supplier-comparison-excel.service';

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
    const excelBuffer = await SupplierComparisonExcelService.generateExcelWorkbook(data);

    const safeLotNumber = (data.tenderNumber || tenderId).replace(/[^\wа-яА-ЯёЁ\-]/gi, '_');
    const filename = `Конкурентный_лист_${safeLotNumber}.xlsx`;

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/supplier-comparison/export-excel GET Error]:', error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || 'Ошибка генерации Excel-файла конкурентного листа' },
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
    let data: any = null;
    try {
      data = await request.json();
    } catch {
      data = null;
    }

    if (!data || !data.suppliers || data.suppliers.length === 0) {
      data = await SupplierComparisonService.getOrCreateComparison(tenderId, auth.userId);
    } else {
      // Auto-save submitted changes on export
      data = await SupplierComparisonService.saveComparison(tenderId, auth.userId, data);
    }

    const excelBuffer = await SupplierComparisonExcelService.generateExcelWorkbook(data);

    const safeLotNumber = (data.tenderNumber || tenderId).replace(/[^\wа-яА-ЯёЁ\-]/gi, '_');
    const filename = `Конкурентный_лист_${safeLotNumber}.xlsx`;

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch (error: any) {
    console.error('[API /api/tenders/[id]/supplier-comparison/export-excel POST Error]:', error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || 'Ошибка экспорта Excel-файла конкурентного листа' },
      { status: 500 }
    );
  }
}
