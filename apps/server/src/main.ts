import { Hono } from "hono";

const app = new Hono();

app.get("/ping", (c) => {
  return c.json({ message: "pong" });
});

export default {
  port: 5174,
  fetch: app.fetch,
};
