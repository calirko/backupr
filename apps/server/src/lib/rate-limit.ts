import type { Context, Next } from "hono";
import { getConnInfo } from "hono/bun";
import { rateLimiter } from "hono-rate-limiter";

/**
 * Number of reverse proxies in front of the server that append to
 * X-Forwarded-For (e.g. outer proxy -> backupr_proxy = 2). Everything left
 * of those entries is client-supplied and can't be trusted, so the client IP
 * is read counting from the right.
 */
const TRUSTED_PROXY_HOPS = Math.max(
	0,
	Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 0,
);

export const getClientIp = (c: Context): string => {
	const remote = getConnInfo(c).remote.address;
	if (TRUSTED_PROXY_HOPS === 0) return remote ?? "unknown";

	const forwarded = (c.req.header("x-forwarded-for") ?? "")
		.split(",")
		.map((ip) => ip.trim())
		.filter(Boolean);

	// With N trusted hops, the Nth entry from the right was written by our
	// outermost proxy and is the real client address.
	return (
		forwarded[forwarded.length - TRUSTED_PROXY_HOPS] ??
		forwarded[0] ??
		remote ??
		"unknown"
	);
};

const tooMany = (c: Context) =>
	c.json({ error: "Too many attempts. Please try again later." }, 429);

const passthrough = async (_c: Context, next: Next) => {
	await next();
};

export const rateLimit =
	process.env.NODE_ENV === "production"
		? rateLimiter({
				windowMs: 15 * 60 * 1000,
				limit: 300,
				standardHeaders: "draft-6",
				keyGenerator: getClientIp,
				handler: tooMany,
			})
		: passthrough;

export const authRateLimit =
	process.env.NODE_ENV === "production"
		? rateLimiter({
				windowMs: 5 * 60 * 1000,
				limit: 3,
				standardHeaders: "draft-6",
				keyGenerator: getClientIp,
				handler: tooMany,
			})
		: passthrough;

/** Unauthenticated agent endpoints (pairing): generous, but not unlimited. */
export const agentRateLimit =
	process.env.NODE_ENV === "production"
		? rateLimiter({
				windowMs: 15 * 60 * 1000,
				limit: 30,
				standardHeaders: "draft-6",
				keyGenerator: getClientIp,
				handler: tooMany,
			})
		: passthrough;
