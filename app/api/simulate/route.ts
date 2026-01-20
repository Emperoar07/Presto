import { NextResponse } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = await rateLimit(`simulate:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() } }
      );
    }

    const simulateKey = process.env.SIMULATE_API_KEY;
    if (!simulateKey && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Simulation not configured' }, { status: 503 });
    }
    if (simulateKey) {
      const headerKey = request.headers.get('x-simulate-key') ?? '';
      const auth = request.headers.get('authorization') ?? '';
      const bearer = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
      if (headerKey !== simulateKey && bearer !== simulateKey) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { 
      network_id,
      from,
      to,
      input,
      value,
      gas,
      gas_price,
      save
    } = await request.json();

    const TENDERLY_ACCESS_KEY = process.env.TENDERLY_ACCESS_KEY;
    const TENDERLY_USER = process.env.TENDERLY_USER;
    const TENDERLY_PROJECT = process.env.TENDERLY_PROJECT;

    if (!TENDERLY_ACCESS_KEY || !TENDERLY_USER || !TENDERLY_PROJECT) {
      return NextResponse.json(
        { error: 'Tenderly configuration missing' },
        { status: 503 }
      );
    }

    const response = await fetch(
      `https://api.tenderly.co/api/v1/account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}/simulate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Key': TENDERLY_ACCESS_KEY,
        },
        body: JSON.stringify({
          network_id,
          from,
          to,
          input,
          value,
          gas,
          gas_price,
          save,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Simulation proxy error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
