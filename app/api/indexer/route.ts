import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

const DEFAULT_OUTPUT = 'data/indexer.json';
const OUTPUT = process.env.INDEXER_OUTPUT ?? DEFAULT_OUTPUT;

function resolveSafeOutputPath(): string | null {
  const root = path.resolve(process.cwd());
  const candidate = path.isAbsolute(OUTPUT) ? OUTPUT : path.join(root, OUTPUT);
  const resolved = path.resolve(candidate);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}

// Fallback data for Vercel deployment (no local filesystem)
const FALLBACK_DATA = {
  pools: [],
  tokens: [],
  lastUpdated: null,
  message: 'Indexer data not available - running on serverless',
};

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = await rateLimit(`indexer:${ip}`, 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() } }
    );
  }

  const filePath = resolveSafeOutputPath();

  if (!filePath) {
    console.error('Indexer output path escapes project root; ignoring.');
    const response = NextResponse.json(FALLBACK_DATA);
    response.headers.set('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=60');
    return response;
  }

  // Return fallback data if file doesn't exist (Vercel deployment)
  if (!fs.existsSync(filePath)) {
    const response = NextResponse.json(FALLBACK_DATA);
    response.headers.set('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=60');
    return response;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const response = NextResponse.json(JSON.parse(raw));
    response.headers.set('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=60');
    return response;
  } catch (error) {
    const err = error as { code?: string };
    if (err?.code === 'ENOENT') {
      const response = NextResponse.json(FALLBACK_DATA);
      response.headers.set('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=60');
      return response;
    }
    console.error('Indexer read failed:', error);
    return NextResponse.json({ error: 'Failed to read indexer output' }, { status: 500 });
  }
}
