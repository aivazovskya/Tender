import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { INITIAL_TENDERS } from '@/lib/mockData';


export async function GET(req: NextRequest) {
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

    let dbTenders = await prisma.tender.findMany({
      where: whereClause,
      include: {
        documents: true,
        riskFlags: true,
        history: true
      },
      orderBy: {
        publishDate: 'desc'
      }
    });

    // Fallback to mockData if DB hasn't been seeded yet
    if (dbTenders.length === 0 && !q && (!region || region === 'Все регионы') && (!category || category === 'Все категории') && (!source || source === 'ALL')) {
      return NextResponse.json({
        success: true,
        count: INITIAL_TENDERS.length,
        tenders: INITIAL_TENDERS,
        isFallback: true
      });
    }

    return NextResponse.json({
      success: true,
      count: dbTenders.length,
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
