import { Hono } from "hono";
import { websocket } from "hono/bun";
import { ensureBucket } from "./lib/storage";
import { scheduler } from "./scheduler";
import { initAgentStatusTracking } from "./agent-status";
import upgradeAgentWebSocket from "./ws.agent";
import upgradeWebWebSocket, { initAgentStatusListener } from "./ws.web";
import userRoutes from "./routes/users";
import agentRoutes from "./routes/agents";
import backupPolicyRoutes from "./routes/backup-policies";
import backupJobRoutes from "./routes/backup-jobs";
import backupRoutes from "./routes/backups";
import generalRoutes from "./routes/general";

const app = new Hono();
userRoutes(app);
agentRoutes(app);
backupPolicyRoutes(app);
backupJobRoutes(app);
backupRoutes(app);
generalRoutes(app);

app.get("/api/agent/ws", upgradeAgentWebSocket);
app.get("/api/web/ws", upgradeWebWebSocket);

initAgentStatusListener();

ensureBucket().catch((err) =>
	console.error("[storage] Failed to ensure bucket:", err),
);

initAgentStatusTracking();
scheduler.start();

export default {
	port: 5174,
	fetch: app.fetch,
	websocket,
	maxRequestBodySize: Number.MAX_SAFE_INTEGER,
};
