import type { Context, Next } from "hono";

/**
 * Small in-memory token bucket per client, for the public party endpoints.
 * The backend is only reachable from the web container, which forwards the
 * visitor's address in x-client-ip (from Cloudflare's cf-connecting-ip).
 */
export function rateLimit(options: {
  capacity: number;
  refillPerSecond: number;
}) {
  const buckets = new Map<string, { tokens: number; updated: number }>();

  return async function rateLimitMiddleware(c: Context, next: Next) {
    const key =
      c.req.header("x-client-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      "unknown";
    const now = Date.now();
    const bucket = buckets.get(key) ?? {
      tokens: options.capacity,
      updated: now,
    };
    bucket.tokens = Math.min(
      options.capacity,
      bucket.tokens + ((now - bucket.updated) / 1000) * options.refillPerSecond,
    );
    bucket.updated = now;
    if (bucket.tokens < 1) {
      buckets.set(key, bucket);
      return c.json({ error: "Too many requests" }, 429);
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket);

    // Forget idle clients so the map can't grow without bound.
    if (buckets.size > 5000) {
      for (const [k, b] of buckets)
        if (now - b.updated > 10 * 60_000) buckets.delete(k);
    }
    await next();
  };
}
