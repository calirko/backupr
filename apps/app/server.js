/**
 * Custom Next.js server (thin wrapper)
 *
 * The WebSocket endpoint (/client-ws) is now handled entirely inside the
 * Next.js Pages-Router API route at pages/api/ws/index.ts.  That route
 * attaches the WebSocketServer to the underlying HTTP server on its first
 * request, so no custom server logic is required here.
 *
 * This file exists only as backward-compatible entry-point for the Docker
 * ENTRYPOINT.  It is functionally equivalent to running `next start`.
 */

const { createServer } = require("node:http");
const { parse } = require("node:url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
	const httpServer = createServer((req, res) => {
		const parsedUrl = parse(req.url, true);
		handle(req, res, parsedUrl);
	});

	httpServer.listen(port, hostname, () => {
		console.log(`> Ready on http://${hostname}:${port}`);
		console.log(
			`> WebSocket endpoint: ws://${hostname}:${port}/client-ws?apiKey=<key>`,
		);
		console.log(`> WS server initialises on first GET /api/ws`);
	});
});
