import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type RateLimitEntry = { count: number; resetAt: number };
const buckets = new Map<string, RateLimitEntry>();
const upstashLimiters = new Map<string, Ratelimit>();

const getUpstashLimiter = (limit: number, windowMs: number) => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const key = `${limit}:${windowSeconds}`;
  const cached = upstashLimiters.get(key);
  if (cached) return cached;

  const redis = new Redis({ url, token });
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
  });
  upstashLimiters.set(key, limiter);
  return limiter;
};

export const getClientIp = (request: Request) => {
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.VERCEL === '1';
  const hasTrustedProxy =
    !!request.headers.get('x-vercel-id') ||
    !!request.headers.get('x-vercel-forwarded-for') ||
    !!request.headers.get('cf-ray');
  if (trustProxy && hasTrustedProxy) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp;
    const cf = request.headers.get('cf-connecting-ip');
    if (cf) return cf;
  }
  return 'unknown';
};

export const rateLimit = async (key: string, limit: number, windowMs: number) => {
  const upstashLimiter = getUpstashLimiter(limit, windowMs);
  if (upstashLimiter) {
    try {
      const result = await upstashLimiter.limit(key);
      const retryAfter = Math.max(0, result.reset - Date.now());
      return { allowed: result.success, retryAfter };
    } catch (error) {
      console.error('Upstash rate limit failed, falling back to in-memory:', error);
    }
  }

  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.max(0, entry.resetAt - now);
    return { allowed: false, retryAfter };
  }

  entry.count += 1;
  return { allowed: true, retryAfter: 0 };
};
