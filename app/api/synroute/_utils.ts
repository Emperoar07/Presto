import { NextResponse } from 'next/server';

const DEFAULT_SYNTHRA_API_BASE = 'https://trading-api.synthra.org';

export async function proxySynRouteRequest(endpoint: 'quote' | 'swap', request: Request) {
  const apiKey = process.env.SYNTHRA_API_KEY ?? process.env.NEXT_PUBLIC_SYNTHRA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'SynRoute API key is not configured' },
      { status: 503 }
    );
  }

  const apiBase = (process.env.SYNTHRA_API_BASE ?? DEFAULT_SYNTHRA_API_BASE).replace(/\/+$/, '');
  const body = await request.json();
  const response = await fetch(`${apiBase}/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || 'SynRoute request failed' };
  }

  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json(data);
}
