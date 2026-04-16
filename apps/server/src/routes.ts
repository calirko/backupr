import type { Hono } from "hono";
import { prisma } from "./lib/prisma";
import { Password } from "./lib/password";
import { Token } from "./lib/token";

const db = prisma

export default async function setupRoutes(app: Hono) {
  app.get("/ping", (c) => {
    return c.json({ message: "pong" });
  });

  // user
  app.post("auth/login", async (c) => {
    let json;

    try {
      json = await c.req.json();
    } catch (e) {
      return c.json({ error: "Invalid or missing JSON body" }, 400);
    }

    const { email, password } = json ?? {};

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const user = await db.user.findUnique({ where: { email } });

    if (!user || !(await Password.compare(password, user.password))) {
      return c.json({ error: "Invalid credentials" }, 401);
    }
    
    const generatedToken = Token.generate({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      }
    })
    
    // create session
    const session = await db.userSession.create({
      data: {
        token: generatedToken,
        user_id: user.id,
      }
    });
    

    return c.json({ message: "Login successful" });
  });
}
