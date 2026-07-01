import type express from "express";

type Clock = () => number;

export interface RateLimitOptions {
  name: string;
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  keyFromRequest?: (req: express.Request) => string;
  clock?: Clock;
}

interface Bucket {
  resetAt: number;
  count: number;
}

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function envInt(name: string, fallback: number) {
  return parsePositiveInt(process.env[name], fallback);
}

function requestKey(req: express.Request) {
  const forwarded = String(req.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  return forwarded || req.ip || req.socket.remoteAddress || "unknown";
}

export function createRateLimiter(options: RateLimitOptions): express.RequestHandler {
  const clock = options.clock ?? Date.now;
  const keyPrefix = options.keyPrefix ?? options.name;
  const keyFromRequest = options.keyFromRequest ?? requestKey;
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    if (options.maxRequests <= 0) return next();

    const now = clock();
    const key = `${keyPrefix}:${keyFromRequest(req)}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, options.maxRequests - bucket.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.setHeader("x-ratelimit-limit", String(options.maxRequests));
    res.setHeader("x-ratelimit-remaining", String(remaining));
    res.setHeader("x-ratelimit-reset", new Date(bucket.resetAt).toISOString());

    if (bucket.count > options.maxRequests) {
      res.setHeader("retry-after", String(retryAfterSeconds));
      return res.status(429).json({ ok: false, error: "Rate limit exceeded", rateLimit: options.name, retryAfterSeconds });
    }

    return next();
  };
}
