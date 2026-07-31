import { NextRequest, NextResponse } from 'next/server';
import { INITIAL_TENDERS } from '@/lib/mockData';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.toLowerCase() || '';
    const region = searchParams.get('region') || '';
    const category = searchParams.get('category') || '';
    const source = searchParams.get('source') || '';

    let filtered = INITIAL_TENDERS;

    if (q) {
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.industryTags.some(tag => tag.toLowerCase().includes(q))
      );
    }

    if (region && region !== 'Все регионы') {
      filtered = filtered.filter(t => t.region === region);
    }

    if (category && category !== 'Все категории') {
      filtered = filtered.filter(t => t.category === category);
    }

    if (source && source !== 'ALL') {
      filtered = filtered.filter(t => t.source === source);
    }

    return NextResponse.json({
      success: true,
      isDemo: true,
      tenders: filtered,
      total: filtered.length
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, isDemo: true, error: error?.message }, { status: 500 });
  }
}
