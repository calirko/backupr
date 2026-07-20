import type { Context, Next } from "hono";
import { getConnInfo } from "hono/bun";
import { rateLimiter } from "hono-rate-limiter";

const getClientIp = (c: Context): string => {
	const headers = Object.fromEntries(
		["x-forwarded-for", "x-real-ip", "cf-connecting-ip", "x-client-ip"].map(
			(h) => [h, c.req.header(h) ?? null],
		),
	);

	console.log("[rate-limiter] headers:", {
		...headers,
		"remote-address": getConnInfo(c).remote.address ?? null,
	});

	return (
		c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
		c.req.header("x-real-ip") ??
		getConnInfo(c).remote.address ??
		"unknown"
	);
};

export const rateLimit =
	process.env.NODE_ENV === "production"
		? rateLimiter({
				windowMs: 15 * 60 * 1000,
				limit: 300,
				standardHeaders: "draft-6",
				keyGenerator: (c) => getClientIp(c),
				handler: (c) => {
					return c.json(
						{ error: "Too many attempts. Please try again later." },
						429,
					);
				},
			})
		: async (c: Context, next: Next) => {
				// console.log("[rate-limiter] dev mode - all headers:", {
				// 	...Object.fromEntries(
				// 		Object.entries(c.req.header()).map(([k, v]) => [k, v]),
				// 	),
				// 	"remote-address": getConnInfo(c).remote.address ?? null,
				// });
				await next();
			};

export const authRateLimit =
	process.env.NODE_ENV === "production"
		? rateLimiter({
				windowMs: 5 * 60 * 1000,
				limit: 3,
				standardHeaders: "draft-6",
				keyGenerator: (c) => getClientIp(c),
				handler: (c) => {
					return c.json(
						{ error: "Too many attempts. Please try again later." },
						429,
					);
				},
			})
		: async (c: Context, next: Next) => {
				// console.log("[rate-limiter] dev mode - all headers:", {
				// 	...Object.fromEntries(
				// 		Object.entries(c.req.header()).map(([k, v]) => [k, v]),
				// 	),
				// 	"remote-address": getConnInfo(c).remote.address ?? null,
				// });
				await next();
			};
