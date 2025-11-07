import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { join } from "node:path";
import { setupAllRoutes } from "./routes";

const app = new Hono();
const prisma = new PrismaClient();

const BACKUP_STORAGE_DIR =
	process.env.BACKUP_STORAGE_DIR || join(process.cwd(), "backups");

// Global type for upload sessions
declare global {
	var uploadSessions: Map<string, any>;
}

global.uploadSessions = global.uploadSessions || new Map();

// Configure CORS with more permissive settings
app.use(
	"/*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "X-API-Key"],
		exposeHeaders: ["Content-Length", "Content-Type"],
		maxAge: 86400,
	}),
);

app.get("/", (c) => {
	return c.json({
		status: "ok",
		message: "Backupr Server is running",
		version: "2.0.0",
	});
});

const validateApiKey = async (c: any, next: any) => {
	const apiKey = c.req.header("X-API-Key");

	if (!apiKey) {
		return c.json({ error: "API key required" }, 401);
	}

	const client = await prisma.client.findUnique({
		where: { apiKey },
	});

	if (!client) {
		return c.json({ error: "Invalid API key" }, 401);
	}

	c.set("client", client);
	await next();
};

// Apply API key validation middleware to all API routes
app.use("/api/*", validateApiKey);

// Setup all routes
setupAllRoutes(app, BACKUP_STORAGE_DIR);

const port = process.env.PORT || 3000;

console.log(`Backupr Server starting on port ${port}...`);
console.log(`Backup storage directory: ${BACKUP_STORAGE_DIR}`);

process.on("SIGINT", async () => {
	await prisma.$disconnect();
	process.exit(0);
});

export default {
	port,
	fetch: app.fetch,
};
