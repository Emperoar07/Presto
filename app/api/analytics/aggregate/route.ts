import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

const OUTPUT = process.env.INDEXER_ANALYTICS_OUTPUT ?? 'data/analytics.json';

// Fallback data for Vercel deployment (no local filesystem)
const FALLBACK_DATA = {
  totalVolume: '0',
  totalTrades: 0,
  totalLiquidity: '0',
  pools: [],
  recentTrades: [],
  lastUpdated: null,
  message: 'Analytics data not available - running on serverless',
};

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = await rateLimit(`analytics:${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() } }
    );
  }

  const filePath = path.isAbsolute(OUTPUT) ? OUTPUT : path.join(process.cwd(), OUTPUT);

  // Return fallback data if file doesn't exist (Vercel deployment)
  if (!fs.existsSync(filePath)) {
    const response = NextResponse.json(FALLBACK_DATA);
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return response;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const response = NextResponse.json(JSON.parse(raw));
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return response;
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === 'ENOENT') {
      const response = NextResponse.json(FALLBACK_DATA);
      response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
      return response;
    }
    console.error('Analytics read failed:', error);
    return NextResponse.json({ error: 'Failed to read analytics output' }, { status: 500 });
  }
}
