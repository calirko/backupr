import { Hono } from "hono";
import { websocket } from "hono/bun";
import setupRoutes from "./routes";
import upgradeAgentWebSocket from "./ws.agent";
import upgradeWebWebSocket from "./ws.web";
import { ensureBucket } from "./lib/storage";
import { scheduler } from "./scheduler";

const app = new Hono();
setupRoutes(app);
app.get("/agent/ws", upgradeAgentWebSocket);
app.get("/web/ws", upgradeWebWebSocket);

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
