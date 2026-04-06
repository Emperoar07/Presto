import { NextRequest, NextResponse } from 'next/server';

const IRIS_SANDBOX_BASE = 'https://iris-api-sandbox.circle.com';
const IRIS_PROD_BASE = 'https://iris-api.circle.com';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const segments = path.join('/');
  const search = request.nextUrl.search;

  // Determine which Iris API to use (sandbox for testnet)
  const upstreamBase = IRIS_SANDBOX_BASE;
  const upstreamUrl = `${upstreamBase}/${segments}${search}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    const text = await upstream.text();
    console.log(`[iris-proxy] GET ${segments} → ${upstream.status}`, text.slice(0, 500));

    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error(`[iris-proxy] GET ${segments} FAILED:`, error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Iris API proxy request failed.', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const segments = path.join('/');
  const search = request.nextUrl.search;

  const upstreamBase = IRIS_SANDBOX_BASE;
  const upstreamUrl = `${upstreamBase}/${segments}${search}`;

  try {
    const body = await request.text();

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('content-type') ?? 'application/json',
        'Accept': 'application/json',
      },
      body,
      cache: 'no-store',
    });

    const text = await upstream.text();
    console.log(`[iris-proxy] POST ${segments} → ${upstream.status}`, text.slice(0, 500));

    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error(`[iris-proxy] POST ${segments} FAILED:`, error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Iris API proxy request failed.', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502 },
    );
  }
}
