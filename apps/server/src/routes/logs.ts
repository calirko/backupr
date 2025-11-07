import { PrismaClient } from "@prisma/client";
import type { Hono } from "hono";

const prisma = new PrismaClient();

export function setupLogsRoutes(app: Hono) {
	app.get("/api/logs", async (c: any) => {
		try {
			const client = c.get("client");
			const limit = parseInt(c.req.query("limit") || "100", 10);

			const logs = await prisma.syncLog.findMany({
				where: {
					clientId: client.id,
				},
				orderBy: {
					timestamp: "desc",
				},
				take: limit,
			});

			return c.json({ logs });
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
