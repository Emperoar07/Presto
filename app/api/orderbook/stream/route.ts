import { getOrderbookData, isValidAddress } from '@/lib/orderbook';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = await rateLimit(`orderbook-stream:${ip}`, 30, 60_000);
  if (!allowed) {
    return new Response('Rate limit exceeded', {
      status: 429,
      headers: { 'Retry-After': Math.ceil(retryAfter / 1000).toString() },
    });
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const depthParam = Number(searchParams.get('depth') ?? '10');
  const chainIdParam = searchParams.get('chainId');
  const chainId = chainIdParam ? parseInt(chainIdParam, 10) : undefined;

  if (!isValidAddress(token)) {
    return new Response('Invalid token address', { status: 400 });
  }

  const depth = Number.isFinite(depthParam) ? Math.min(Math.max(depthParam, 1), 50) : 10;
  const encoder = new TextEncoder();

  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        try {
          const timeoutMs = 8000;
          const data = await Promise.race([
            getOrderbookData(token!, depth, 2000, chainId),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Orderbook timeout')), timeoutMs)),
          ]);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'stream_failed' })}\n\n`));
        }
      };

      await send();
      interval = setInterval(send, 4000);
    },
    cancel() {
      if (interval) clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
