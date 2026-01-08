import type { Context } from "hono";
import { Token } from "./token";

// Middleware to validate JWT token
export async function validateToken(c: Context, next: () => Promise<void>) {
	try {
		const authHeader = c.req.header("Authorization");

		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return c.json({ error: "No token provided" }, 401);
		}

		const token = authHeader.substring(7);
		const payload = await Token.decrypt(token);

		if (!payload) {
			return c.json({ error: "Invalid or expired token" }, 401);
		}

		c.set("user", payload);
		await next();
	} catch (error) {
		console.error("Token validation error:", error);
		return c.json({ error: "Unauthorized" }, 401);
	}
}
