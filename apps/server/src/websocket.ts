import { upgradeWebSocket, websocket } from "hono/bun";
import { prisma } from "./lib/prisma";

const db = prisma;

interface WSContext {
	agentId: string;
	sessionId: string;
}

export { upgradeWebSocket, websocket };

export const wsHandler = upgradeWebSocket(async (c) => {
	const token = c.req.query("token");

	if (!token) {
		throw new Error("Missing authentication token");
	}

	// Validate Agent Token against Database
	const session = await db.agentSession.findUnique({
		where: { token },
		include: { agent: true },
	});

	if (!session || !session.agent.is_active) {
		console.error("Unauthorized agent connection attempt");
		throw new Error("Unauthorized agent");
	}

	return {
		onOpen(event, ws) {
			console.log(`Agent ${session.agent.name} connected`);
			ws.raw.data = { agentId: session.agent_id, sessionId: session.id };
		},
		async onMessage(event, ws) {
			const data = event.data.toString();

			// Handle Heartbeat
			if (data === "ping") {
				await db.agent.update({
					where: { id: session.agent_id },
					data: { last_seen: new Date() },
				});
				ws.send("pong");
				return;
			}

			// Handle other agent commands here...
			console.log(`Message from agent ${session.agent.id}:`, data);
		},
		onClose(event, ws) {
			console.log(`Agent ${session.agent.name} disconnected`);
		},
	};
});
