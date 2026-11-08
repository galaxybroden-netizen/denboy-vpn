// MVMP — Rate Limiting Utility (in-memory, Redis-compatible interface)
// Phase 12.1: Rate limiting for chat API and AI endpoints.
// Uses in-memory token bucket when Redis is not available.
// In production with Redis: replace with Redis-based implementation.

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, RateLimitBucket>();

interface RateLimitConfig {
  /** Maximum requests allowed in the time window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/** Default rate limit configs per endpoint type */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  chat: { maxRequests: 20, windowMs: 60_000 }, // 20 messages per minute per user/IP
  ai_agent: { maxRequests: 10, windowMs: 60_000 }, // 10 agent requests per minute
  ai_suggest: { maxRequests: 5, windowMs: 60_000 }, // 5 suggestion requests per minute
  ai_provider_test: { maxRequests: 3, windowMs: 60_000 }, // 3 test connections per minute
};

/**
 * Check if a request is allowed under rate limiting.
 * Returns { allowed: boolean, retryAfter: number (seconds) }
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; retryAfter: number; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket) {
    // First request — create bucket with full tokens
    buckets.set(key, { tokens: config.maxRequests - 1, lastRefill: now });
    return { allowed: true, retryAfter: 0, remaining: config.maxRequests - 1 };
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const refillAmount = Math.floor((elapsed / config.windowMs) * config.maxRequests);
  
  if (refillAmount > 0) {
    bucket.tokens = Math.min(config.maxRequests, bucket.tokens + refillAmount);
    bucket.lastRefill = now;
  }

  if (bucket.tokens > 0) {
    bucket.tokens--;
    return { allowed: true, retryAfter: 0, remaining: bucket.tokens };
  }

  // Rate limited — calculate retry-after
  const retryAfterMs = config.windowMs - elapsed;
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return { allowed: false, retryAfter: retryAfterSec, remaining: 0 };
}

/**
 * Get rate limit key for a user/IP combination.
 * Priority: userId (if authenticated) > IP address > "anonymous"
 */
export function getRateLimitKey(userId?: string, ip?: string, prefix?: string): string {
  const identifier = userId || ip || "anonymous";
  return `${prefix || "default"}:${identifier}`;
}

/**
 * Clean up expired buckets periodically (called on each check).
 * Removes buckets that haven't been used in the last 5 minutes.
 */
export function cleanupExpiredBuckets(): void {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > maxAge) {
      buckets.delete(key);
    }
  }
}
