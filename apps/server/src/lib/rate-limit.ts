import { rateLimiter } from "hono-rate-limiter";
import { getConnInfo } from "hono/bun";
import type { Context, Next } from "hono";

export const rateLimit = process.env.NODE_ENV === "production" ? rateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-6",
  keyGenerator: (c) => {
    const info = getConnInfo(c);
    return info.remote.address ?? "unknown";
  },
  handler: (c) => {
    return c.json({ error: "Too many attempts. Please try again later." }, 429);
  },
}) : async (c: Context, next: Next) => {
  await next();
};
