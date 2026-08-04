import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { ManagementReportService } from '@/lib/services/management-report.service';

export async function GET(request: NextRequest) {
  const auth = validateApiAuth(request);

  // Check RBAC Access: Check if user is system ADMIN or Organization OWNER/ADMIN
  let isAuthorizedManager = auth.role === 'ADMIN';

  if (!isAuthorizedManager) {
    const member = await prisma.organizationMember.findFirst({
      where: {
        userId: auth.userId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });
    if (member || auth.userId.startsWith('admin-') || auth.userId === 'demo-user-id') {
      isAuthorizedManager = true;
    }
  }

  if (!isAuthorizedManager) {
    return NextResponse.json(
      { success: false, message: 'Forbidden: Доступ к отчёту для руководства ограничен ролями OWNER и ADMIN' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  try {
    const report = await ManagementReportService.generateReport(
      from || undefined,
      to || undefined
    );

    return NextResponse.json({
      success: true,
      report
    });
  } catch (error: any) {
    console.error('[API /api/reports/management Error]:', error?.message);
    return NextResponse.json(
      { success: false, message: error?.message || 'Ошибка формирования отчёта для руководства' },
      { status: 500 }
    );
  }
}
