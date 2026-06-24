import { NextResponse } from 'next/server';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

const DEFAULT_SYNTHRA_API_BASE = 'https://trading-api.synthra.org';
const ARC_CHAIN_ID = 5042002;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const UINT_PATTERN = /^[1-9]\d{0,77}$/;

type SynRouteEndpoint = 'quote' | 'swap';

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isAddress(value: unknown): value is string {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value);
}

function isPositiveUint(value: unknown): value is string {
  return typeof value === 'string' && UINT_PATTERN.test(value);
}

export function validateSynRouteBody(endpoint: SynRouteEndpoint, body: unknown) {
  if (!body || typeof body !== 'object') return 'Request body must be an object';
  const record = body as Record<string, unknown>;

  if (record.chainId !== ARC_CHAIN_ID) return 'SynRoute is only enabled on Arc Testnet';
  if (!isAddress(record.tokenIn)) return 'tokenIn must be an EVM address';
  if (!isAddress(record.tokenOut)) return 'tokenOut must be an EVM address';
  if (String(record.tokenIn).toLowerCase() === String(record.tokenOut).toLowerCase()) {
    return 'tokenIn and tokenOut must be different';
  }
  if (!isPositiveUint(record.amount)) return 'amount must be a positive integer string';
  if (
    record.tradeType !== undefined &&
    record.tradeType !== 'EXACT_INPUT' &&
    record.tradeType !== 'EXACT_OUTPUT'
  ) {
    return 'tradeType must be EXACT_INPUT or EXACT_OUTPUT';
  }

  if (endpoint === 'swap') {
    if (!isAddress(record.sender)) return 'sender must be an EVM address';
    if (!isAddress(record.recipient)) return 'recipient must be an EVM address';
    if (record.approvalMode !== 'erc20' && record.approvalMode !== 'permit2') {
      return 'approvalMode must be erc20 or permit2';
    }
    const slippageBps = record.slippageBps;
    if (
      typeof slippageBps !== 'number' ||
      !Number.isInteger(slippageBps) ||
      slippageBps < 0 ||
      slippageBps > 5000
    ) {
      return 'slippageBps must be an integer from 0 to 5000';
    }
  }

  return null;
}

export async function proxySynRouteRequest(endpoint: SynRouteEndpoint, request: Request) {
  const ip = getClientIp(request);
  const limit = endpoint === 'quote' ? 60 : 20;
  const { allowed, retryAfter } = await rateLimit(`synroute:${endpoint}:${ip}`, limit, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() } }
    );
  }

  const apiKey = process.env.SYNTHRA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'SynRoute API key is not configured' },
      { status: 503 }
    );
  }

  const apiBase = (process.env.SYNTHRA_API_BASE ?? DEFAULT_SYNTHRA_API_BASE).replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(apiBase)) {
    return NextResponse.json({ error: 'SynRoute API base is invalid' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON');
  }

  const validationError = validateSynRouteBody(endpoint, body);
  if (validationError) return badRequest(validationError);

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
