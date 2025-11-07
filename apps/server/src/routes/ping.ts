import type { Hono } from "hono";

export function setupPingRoutes(app: Hono) {
	app.get("/api/ping", async (c: any) => {
		try {
			const client = c.get("client");
			return c.json({
				success: true,
				message: "Connection successful",
				clientName: client.name,
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: "Ping failed", details: errorMessage }, 500);
		}
	});
}
