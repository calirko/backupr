import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { Hono } from "hono";
import { Token } from "../lib/token";

const prisma = new PrismaClient();

export function setupAuthRoutes(app: Hono) {
	// Login route
	app.post("/api/auth/signin", async (c) => {
		try {
			const { email, password } = await c.req.json();

			// Validate input
			if (!email || !password) {
				return c.json({ error: "Email and password are required" }, 400);
			}

			// Find user by email
			const user = await prisma.user.findUnique({
				where: { email },
			});

			if (!user) {
				return c.json({ error: "Invalid email or password" }, 401);
			}

			// Verify password
			const isPasswordValid = await bcrypt.compare(password, user.password);

			if (!isPasswordValid) {
				return c.json({ error: "Invalid email or password" }, 401);
			}

			// Generate JWT token
			const token = await Token.encrypt({
				userId: user.id,
				email: user.email,
				name: user.name,
			});

			return c.json({
				success: true,
				token,
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
					apiKey: user.apiKey,
				},
			});
		} catch (error) {
			console.error("Login error:", error);
			return c.json({ error: "Internal server error" }, 500);
		}
	});

	// Verify token route
	app.get("/api/auth/verify", async (c) => {
		try {
			const authHeader = c.req.header("Authorization");

			if (!authHeader || !authHeader.startsWith("Bearer ")) {
				return c.json({ error: "No token provided" }, 401);
			}

			const token = authHeader.substring(7);
			const payload = await Token.decrypt(token);

			if (!payload) {
				return c.json({ error: "Invalid or expired token" }, 401);
			}

			// Get fresh user data
			const user = await prisma.user.findUnique({
				where: { id: payload.userId },
			});

			if (!user) {
				return c.json({ error: "User not found" }, 404);
			}

			return c.json({
				success: true,
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
					apiKey: user.apiKey,
				},
			});
		} catch (error) {
			console.error("Verify token error:", error);
			return c.json({ error: "Internal server error" }, 500);
		}
	});
}
