import { BlockList, isIP } from "node:net";
import type { Context, Next } from "hono";
import { getConnInfo } from "hono/bun";
import { rateLimiter } from "hono-rate-limiter";
import { IS_PRODUCTION } from "./env";

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

/**
 * Comma-separated IPs or CIDR ranges (e.g. the office) that bypass rate
 * limiting entirely: RATE_LIMIT_ALLOWLIST=203.0.113.7,198.51.100.0/24
 */
const allowlist = new BlockList();
for (const raw of (process.env.RATE_LIMIT_ALLOWLIST ?? "").split(",")) {
	const entry = raw.trim();
	if (!entry) continue;
	const [address = "", prefix] = entry.split("/");
	const version = isIP(address);
	if (!version) {
		console.warn(`Ignoring invalid RATE_LIMIT_ALLOWLIST entry: ${entry}`);
		continue;
	}
	const type = version === 6 ? "ipv6" : "ipv4";
	if (prefix === undefined) allowlist.addAddress(address, type);
	else allowlist.addSubnet(address, Number.parseInt(prefix, 10), type);
}

const isAllowlisted = (c: Context): boolean => {
	// IPv4 clients can show up as IPv4-mapped IPv6 (::ffff:1.2.3.4)
	const ip = getClientIp(c).replace(/^::ffff:(?=\d+\.)/, "");
	const type = isIP(ip);
	if (!type) return false;
	return allowlist.check(ip, type === 6 ? "ipv6" : "ipv4");
};

const tooMany = (c: Context) =>
	c.json({ error: "Too many attempts. Please try again later." }, 429);

const passthrough = async (_c: Context, next: Next) => {
	await next();
};

export const rateLimit =
	IS_PRODUCTION
		? rateLimiter({
				windowMs: 15 * 60 * 1000,
				limit: 300,
				standardHeaders: "draft-6",
				keyGenerator: getClientIp,
				handler: tooMany,
				skip: isAllowlisted,
			})
		: passthrough;

export const authRateLimit =
	IS_PRODUCTION
		? rateLimiter({
				windowMs: 5 * 60 * 1000,
				limit: 3,
				standardHeaders: "draft-6",
				keyGenerator: getClientIp,
				handler: tooMany,
				skip: isAllowlisted,
			})
		: passthrough;

/** Unauthenticated agent endpoints (pairing): generous, but not unlimited. */
export const agentRateLimit =
	IS_PRODUCTION
		? rateLimiter({
				windowMs: 15 * 60 * 1000,
				limit: 30,
				standardHeaders: "draft-6",
				keyGenerator: getClientIp,
				handler: tooMany,
				skip: isAllowlisted,
			})
		: passthrough;
