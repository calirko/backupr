import { PrismaClient } from "@prisma/client";
import type { Hono } from "hono";
import { Token } from "../lib/token";

const prisma = new PrismaClient();

// Middleware to validate JWT token
async function validateToken(c: any, next: any) {
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

export function setupLogsRoutes(app: Hono) {
	app.get("/api/logs", validateToken, async (c: any) => {
		try {
			const skip = parseInt(c.req.query("skip") || "0", 10);
			const take = parseInt(c.req.query("take") || "100", 10);
			const filtersParam = c.req.query("filters");
			const orderByParam = c.req.query("orderBy");

			// Parse filters and orderBy if provided
			const filters = filtersParam ? JSON.parse(decodeURIComponent(filtersParam)) : {};
			const orderBy = orderByParam ? JSON.parse(decodeURIComponent(orderByParam)) : { timestamp: "desc" };

			// Build where clause from filters
			const where: any = {};
			if (filters.action) {
				where.action = filters.action;
			}
			if (filters.status) {
				where.status = filters.status;
			}

			const [logs, total] = await Promise.all([
				prisma.syncLog.findMany({
					where,
					skip,
					take,
					orderBy,
					include: {
						client: {
							select: {
								id: true,
								name: true,
								email: true,
							},
						},
					},
				}),
				prisma.syncLog.count({ where }),
			]);

			return c.json({ data: logs, total });
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return c.json(
				{ error: "Failed to fetch logs", details: errorMessage },
				500,
			);
		}
	});
}
