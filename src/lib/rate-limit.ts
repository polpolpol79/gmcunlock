const memoryStore = new Map<string, { count: number; resetAt: number }>();

export function getClientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function consumeRateLimit(params: {
  key: string;
  bucket: string;
  limit: number;
  windowMs: number;
}): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const mapKey = `${params.bucket}:${params.key}`;
  const current = memoryStore.get(mapKey);

  if (!current || current.resetAt <= now) {
    const resetAt = now + params.windowMs;
    memoryStore.set(mapKey, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(0, params.limit - 1), resetAt };
  }

  if (current.count >= params.limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  memoryStore.set(mapKey, current);
  return {
    allowed: true,
    remaining: Math.max(0, params.limit - current.count),
    resetAt: current.resetAt,
  };
}

