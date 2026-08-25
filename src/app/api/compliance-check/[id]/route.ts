import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateApiAuth } from '@/lib/security/auth';
import { resolveOwnCompanyProfile } from '@/lib/security/resolve-company-profile';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Mandatory Multi-Tenant Authentication Guard
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  const checkId = params.id;

  try {
    // 2. Resolve Caller's Own Company Profile
    const companyProfile = await resolveOwnCompanyProfile(auth.userId);
    if (!companyProfile) {
      return NextResponse.json(
        { success: false, message: 'Профиль компании не найден' },
        { status: 404 }
      );
    }

    // 3. Find ComplianceCheck with IDOR Prevention
    const check = await prisma.complianceCheck.findFirst({
      where: {
        id: checkId,
        companyProfileId: companyProfile.id
      },
      include: {
        items: {
          orderBy: { id: 'asc' }
        },
        tender: {
          select: { id: true, externalId: true, title: true, customerName: true, amount: true }
        }
      }
    });

    if (!check) {
      return NextResponse.json(
        { success: false, message: 'Проверка соответствия не найдена или принадлежит другой организации' },
        { status: 404 }
      );
    }

    // Calculate critical mismatches list for fast frontend rendering
    const criticalMismatches = check.items.filter(
      item => item.isCritical && (item.status === 'MISMATCH' || item.status === 'MISSING')
    );

    return NextResponse.json({
      success: true,
      check: {
        ...check,
        criticalMismatches
      }
    });
  } catch (err: any) {
    console.error(`[API /api/compliance-check/${checkId} GET Error]:`, err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Ошибка загрузки результатов проверки' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Mandatory Multi-Tenant Authentication Guard
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  const checkId = params.id;

  try {
    // 2. Resolve Caller's Own Company Profile
    const companyProfile = await resolveOwnCompanyProfile(auth.userId);
    if (!companyProfile) {
      return NextResponse.json(
        { success: false, message: 'Профиль компании не найден' },
        { status: 404 }
      );
    }

    // 3. IDOR Guard: Verify ownership before deletion
    const existing = await prisma.complianceCheck.findFirst({
      where: {
        id: checkId,
        companyProfileId: companyProfile.id
      }
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: 'Проверка не найдена или нет прав на удаление' },
        { status: 404 }
      );
    }

    await prisma.complianceCheck.delete({
      where: { id: checkId }
    });

    return NextResponse.json({
      success: true,
      message: 'Запись проверки успешно удалена'
    });
  } catch (err: any) {
    console.error(`[API /api/compliance-check/${checkId} DELETE Error]:`, err);
    return NextResponse.json(
      { success: false, message: err?.message || 'Ошибка удаления проверки' },
      { status: 500 }
    );
  }
}
