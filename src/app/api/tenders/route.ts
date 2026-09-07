import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { INITIAL_TENDERS } from '@/lib/mockData';
import { validateApiAuth } from '@/lib/security/auth';

export async function GET(req: NextRequest) {
  const auth = await validateApiAuth(req);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const region = searchParams.get('region');
  const category = searchParams.get('category');
  const source = searchParams.get('source');
  const minAmount = searchParams.get('minAmount');
  const maxAmount = searchParams.get('maxAmount');

  try {
    const whereClause: any = {};

    if (region && region !== 'Все регионы') {
      whereClause.region = region;
    }

    if (category && category !== 'Все категории') {
      whereClause.category = category;
    }

    if (source && source !== 'ALL') {
      whereClause.source = source;
    }

    if (minAmount || maxAmount) {
      whereClause.amount = {};
      if (minAmount) whereClause.amount.gte = parseFloat(minAmount);
      if (maxAmount) whereClause.amount.lte = parseFloat(maxAmount);
    }

    if (q) {
      whereClause.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } }
      ];
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const [total, dbTenders] = await Promise.all([
      prisma.tender.count({ where: whereClause }),
      prisma.tender.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          documents: {
            select: {
              id: true,
              tenderId: true,
              fileName: true,
              fileUrl: true,
              fileSize: true,
              docType: true,
              createdAt: true
              // extractedText is excluded from list view to prevent V8 heap OOM
            }
          },
          riskFlags: true,
          history: true
        },
        orderBy: {
          publishDate: 'desc'
        }
      })
    ]);

    // Fallback to mockData if DB hasn't been seeded yet
    if (total === 0 && !q && (!region || region === 'Все регионы') && (!category || category === 'Все категории') && (!source || source === 'ALL')) {
      const pagedMock = INITIAL_TENDERS.slice(skip, skip + limit);
      return NextResponse.json({
        success: true,
        count: pagedMock.length,
        total: INITIAL_TENDERS.length,
        page,
        limit,
        totalPages: Math.ceil(INITIAL_TENDERS.length / limit),
        tenders: pagedMock,
        isFallback: true
      });
    }

    return NextResponse.json({
      success: true,
      count: dbTenders.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      tenders: dbTenders,
      isFallback: false
    });

  } catch (error: any) {
    console.error('[API /api/tenders Error]:', error);
    // Graceful fallback on DB connection error
    return NextResponse.json({
      success: true,
      count: INITIAL_TENDERS.length,
      tenders: INITIAL_TENDERS,
      isFallback: true,
      error: error.message
    });
  }
}
