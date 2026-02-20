/**
 * pages/api/ws/index.ts
 *
 * Initialises the WebSocket server on the underlying Node.js HTTP server so it
 * survives across requests.  Clients (and ws-client.js) issue a plain GET here
 * before opening the WebSocket connection to guarantee the WSS is attached.
 *
 * WebSocket upgrade path: /client-ws?apiKey=<key>
 *
 * Using Pages Router here on purpose: `res.socket.server` gives direct access to
 * the Node.js http.Server instance which is required to intercept upgrade events.
 * App Router route handlers use the Web Request/Response API and do not expose
 * this.
 */

import { Token } from "@/lib/server/token";
import { registerClient, registerFrontend } from "@/lib/server/ws-manager";
import { PrismaClient } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Server as HTTPServer, IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";
import { parse } from "node:url";
import { WebSocketServer } from "ws";

// ── Types ─────────────────────────────────────────────────────────────────────

type ServerWithWss = HTTPServer & { wss?: WebSocketServer };

/** Cast for the Pages-Router response which carries the raw Node socket. */
type ResWithSocket = NextApiResponse & {
	socket: Socket & { server: ServerWithWss };
};

// ── Prisma singleton ──────────────────────────────────────────────────────────

let prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
	if (!prisma) prisma = new PrismaClient();
	return prisma;
}

// ── Route config ──────────────────────────────────────────────────────────────

export const config = {
	api: { bodyParser: false },
};

// ── Handler ───────────────────────────────────────────────────────────────────

export default function handler(_req: NextApiRequest, res: ResWithSocket) {
	// Already initialised – nothing to do.
	if (res.socket.server.wss) {
		res.end();
		return;
	}

	const httpServer = res.socket.server;
	const wss = new WebSocketServer({ noServer: true });

	httpServer.on(
		"upgrade",
		async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
			const { pathname, query } = parse(request.url ?? "", true);

			// ── Frontend browser clients ──────────────────────────────────────────
			if (pathname === "/frontend-ws") {
				const token = query.token as string | undefined;
				if (!token) {
					socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
					socket.destroy();
					return;
				}

				const valid = await Token.validate(token);
				if (!valid) {
					socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
					socket.destroy();
					return;
				}

				wss.handleUpgrade(request, socket, head, (ws) => {
					registerFrontend(ws);
					wss.emit("connection", ws, request);
				});
				return;
			}

			// Only handle /client-ws upgrades; leave everything else to Next.js.
			if (pathname !== "/client-ws") return;

			console.log(`[WS] Upgrade request received: ${request.url}`);

			const apiKey = query.apiKey as string | undefined;
			if (!apiKey) {
				socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
				socket.destroy();
				return;
			}

			try {
				const client = await getPrisma().client.findUnique({
					where: { apiKey: String(apiKey) },
				});

				if (!client) {
					socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
					socket.destroy();
					return;
				}

				wss.handleUpgrade(request, socket, head, (ws) => {
					console.log(
						`[WS] Client connected: ${client.name} (id: ${client.id})`,
					);
					registerClient(ws, String(apiKey));
					wss.emit("connection", ws, request);
				});
			} catch (err) {
				console.error("[WS] Error validating apiKey during upgrade:", err);
				socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
				socket.destroy();
			}
		},
	);

	// Persist the WSS on the server so the guard above short-circuits on the
	// next call without re-attaching the upgrade listener.
	httpServer.wss = wss;

	console.log(
		"[WS] WebSocket server initialised on /client-ws and /frontend-ws",
	);
	res.end();
}
