import { NextRequest, NextResponse } from 'next/server';
import { validatePublicApiKey } from '@/lib/security/public-api-guard';
import { prisma } from '@/lib/prisma';
import { INITIAL_TENDERS as mockTenders } from '@/lib/mockData';

export async function GET(request: NextRequest) {
  // 1. Enforce Public API Key Authentication & Enterprise Guard
  const auth = await validatePublicApiKey(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const region = searchParams.get('region');
  const category = searchParams.get('category');
  const source = searchParams.get('source');
  const minAmount = searchParams.get('minAmount');
  const maxAmount = searchParams.get('maxAmount');
  const query = searchParams.get('q');

  let tenders: any[] = [];

  // Try fetching from Prisma DB
  try {
    const where: any = {};
    if (region && region !== 'Все регионы') where.region = region;
    if (category && category !== 'Все категории') where.category = category;
    if (source && source !== 'ALL') where.source = source;
    if (minAmount) where.amount = { ...(where.amount || {}), gte: parseFloat(minAmount) };
    if (maxAmount) where.amount = { ...(where.amount || {}), lte: parseFloat(maxAmount) };
    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { customerName: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } }
      ];
    }

    tenders = await prisma.tender.findMany({
      where,
      orderBy: { publishDate: 'desc' },
      take: 100
    });
  } catch {
    tenders = [];
  }

  // Fallback to mock tenders if DB empty or disconnected
  if (tenders.length === 0) {
    tenders = mockTenders.filter((t) => {
      if (region && region !== 'Все регионы' && t.region !== region) return false;
      if (category && category !== 'Все категории' && t.category !== category) return false;
      if (source && source !== 'ALL' && t.source !== source) return false;
      if (minAmount && t.amount < parseFloat(minAmount)) return false;
      if (maxAmount && t.amount > parseFloat(maxAmount)) return false;
      if (query && !t.title.toLowerCase().includes(query.toLowerCase()) && !t.customerName.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }

  return NextResponse.json({
    success: true,
    count: tenders.length,
    tenders: tenders.map(t => ({
      id: t.id,
      externalId: t.externalId,
      source: t.source,
      title: t.title,
      description: t.description,
      customerName: t.customerName,
      customerBin: t.customerBin,
      category: t.category,
      amount: t.amount,
      currency: t.currency || 'KZT',
      region: t.region,
      publishDate: t.publishDate,
      deadlineDate: t.deadlineDate,
      status: t.status,
      sourceUrl: t.sourceUrl,
      riskScore: t.riskScore,
      aiSummary: t.aiSummary
    }))
  });
}
