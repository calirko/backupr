import { Hono } from "hono";
import { websocket } from "hono/bun";
import { ensureBucket } from "./lib/storage";
import setupRoutes from "./routes";
import { scheduler } from "./scheduler";
import upgradeAgentWebSocket from "./ws.agent";
import upgradeWebWebSocket from "./ws.web";

const app = new Hono();
setupRoutes(app);
app.get("/api/agent/ws", upgradeAgentWebSocket);
app.get("/api/web/ws", upgradeWebWebSocket);

ensureBucket().catch((err) =>
	console.error("[storage] Failed to ensure bucket:", err),
);

scheduler.start();

export default {
	port: 5174,
	fetch: app.fetch,
	websocket,
	maxRequestBodySize: Number.MAX_SAFE_INTEGER,
};
