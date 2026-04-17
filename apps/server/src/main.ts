import { Hono } from "hono";
import setupRoutes from "./routes";
import { wsHandler } from "./websocket";

const app = new Hono();

app.get("/agent/ws", wsHandler);

setupRoutes(app);

export default {
	port: 5174,
	fetch: app.fetch,
};
