import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

const OUTPUT = process.env.INDEXER_OUTPUT ?? 'data/indexer.json';

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = await rateLimit(`indexer:${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() } }
    );
  }

  const filePath = path.isAbsolute(OUTPUT) ? OUTPUT : path.join(process.cwd(), OUTPUT);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Indexer output not found' }, { status: 404 });
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const response = NextResponse.json(JSON.parse(raw));
    response.headers.set('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=60');
    return response;
  } catch (error) {
    console.error('Indexer read failed:', error);
    return NextResponse.json({ error: 'Failed to read indexer output' }, { status: 500 });
  }
}
