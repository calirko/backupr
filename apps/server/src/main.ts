import { Hono } from "hono";
import { websocket } from "hono/bun";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { secureHeaders } from "hono/secure-headers";
import { Prisma } from "../prisma/generated/prisma/client";
import { ensureBucket } from "./lib/storage";
import { QueryError } from "./lib/query";
import { HttpError } from "./lib/validate";
import { scheduler } from "./scheduler";
import { initAgentStatusTracking } from "./agent-status";
import { registerNotificationTasks } from "./notifications";
import upgradeAgentWebSocket from "./ws.agent";
import upgradeWebWebSocket, { initAgentStatusListener } from "./ws.web";
import userRoutes from "./routes/users";
import agentRoutes from "./routes/agents";
import backupPolicyRoutes from "./routes/backup-policies";
import backupJobRoutes from "./routes/backup-jobs";
import backupRoutes from "./routes/backups";
import generalRoutes from "./routes/general";
import notificationRoutes from "./routes/notifications";

const MAX_BODY_BYTES = 1024 * 1024;

const app = new Hono();

// The API only serves JSON; lock it down and keep responses out of shared caches
app.use(
	"/api/*",
	secureHeaders({
		contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
		xFrameOptions: "DENY",
		referrerPolicy: "no-referrer",
	}),
);
app.use("/api/*", async (c, next) => {
	await next();
	if (!c.res.headers.has("Cache-Control")) {
		c.header("Cache-Control", "no-store");
	}
});

// gzip/deflate JSON responses (WebSocket upgrades carry no body and are skipped)
app.use("/api/*", compress());

// Backups go straight to object storage via presigned URLs; no route needs big bodies
app.use(
	"/api/*",
	bodyLimit({
		maxSize: MAX_BODY_BYTES,
		onError: (c) => c.json({ error: "Request body too large" }, 413),
	}),
);

app.onError((err, c) => {
	if (err instanceof HttpError) {
		return c.json({ error: err.message }, err.status);
	}
	if (err instanceof QueryError) {
		return c.json({ error: err.message }, 400);
	}
	if (err instanceof Prisma.PrismaClientKnownRequestError) {
		switch (err.code) {
			case "P2025":
				return c.json({ error: "Not found" }, 404);
			case "P2002":
				return c.json({ error: "A record with that value already exists" }, 409);
			case "P2003":
				return c.json({ error: "Referenced record does not exist" }, 400);
		}
	}
	if (err instanceof Prisma.PrismaClientValidationError) {
		return c.json({ error: "Invalid request" }, 400);
	}

	console.error(`[http] ${c.req.method} ${c.req.path} failed:`, err);
	return c.json({ error: "Internal server error" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

userRoutes(app);
agentRoutes(app);
backupPolicyRoutes(app);
backupJobRoutes(app);
backupRoutes(app);
generalRoutes(app);
notificationRoutes(app);

app.get("/api/agent/ws", upgradeAgentWebSocket);
app.get("/api/web/ws", upgradeWebWebSocket);

initAgentStatusListener();

ensureBucket().catch((err) =>
	console.error("[storage] Failed to ensure bucket:", err),
);

initAgentStatusTracking();
registerNotificationTasks();
scheduler.start();

export default {
	port: 5174,
	fetch: app.fetch,
	websocket,
	maxRequestBodySize: MAX_BODY_BYTES * 2,
};
