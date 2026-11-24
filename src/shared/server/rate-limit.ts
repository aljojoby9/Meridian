type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (bucket.count >= limit) return { ok: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count };
}

// NOTE: in-memory limiter is per-process. Use Redis/Upstash in multi-instance production.
