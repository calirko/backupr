import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { Hono } from "hono";
import { Token } from "../lib/token";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

// Middleware to validate JWT token
async function validateToken(c: any, next: any) {
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

		c.set("user", payload);
		await next();
	} catch (error) {
		console.error("Token validation error:", error);
		return c.json({ error: "Unauthorized" }, 401);
	}
}

export function setupUsersRoutes(app: Hono) {
	// Get all users (with pagination, filters, ordering)
	app.get("/api/users", validateToken, async (c) => {
		try {
			const skip = parseInt(c.req.query("skip") || "0", 10);
			const take = parseInt(c.req.query("take") || "30", 10);
			const filtersParam = c.req.query("filters");
			const orderByParam = c.req.query("orderBy");

			// Parse filters and orderBy if provided
			const filters = filtersParam ? JSON.parse(decodeURIComponent(filtersParam)) : {};
			const orderBy = orderByParam ? JSON.parse(decodeURIComponent(orderByParam)) : { createdAt: "desc" };

			// Build where clause from filters
			const where: any = {};
			if (filters.email) {
				where.email = { contains: filters.email, mode: "insensitive" };
			}
			if (filters.name) {
				where.name = { contains: filters.name, mode: "insensitive" };
			}

			const [users, total] = await Promise.all([
				prisma.user.findMany({
					where,
					skip,
					take,
					orderBy,
					select: {
						id: true,
						name: true,
						email: true,
						apiKey: true,
						createdAt: true,
					},
				}),
				prisma.user.count({ where }),
			]);

			return c.json({ data: users, total });
		} catch (error) {
			console.error("Error fetching users:", error);
			return c.json({ error: "Failed to fetch users" }, 500);
		}
	});

	// Get single user by ID
	app.get("/api/users/:id", validateToken, async (c) => {
		try {
			const id = c.req.param("id");

			const user = await prisma.user.findUnique({
				where: { id },
				select: {
					id: true,
					name: true,
					email: true,
					apiKey: true,
					createdAt: true,
				},
			});

			if (!user) {
				return c.json({ error: "User not found" }, 404);
			}

			return c.json({ user });
		} catch (error) {
			console.error("Error fetching user:", error);
			return c.json({ error: "Failed to fetch user" }, 500);
		}
	});

	// Create new user
	app.post("/api/users", validateToken, async (c) => {
		try {
			const { name, email, password } = await c.req.json();

			// Validate required fields
			if (!name || !email || !password) {
				return c.json(
					{ error: "Name, email, and password are required" },
					400,
				);
			}

			// Check if user with email already exists
			const existingUser = await prisma.user.findUnique({
				where: { email },
			});

			if (existingUser) {
				return c.json({ error: "A user with this email already exists" }, 400);
			}

			// Hash password
			const hashedPassword = await bcrypt.hash(password, 10);

			// Generate API key
			const apiKey = randomBytes(32).toString("hex");

			// Create user
			const user = await prisma.user.create({
				data: {
					name,
					email,
					password: hashedPassword,
					apiKey,
				},
				select: {
					id: true,
					name: true,
					email: true,
					apiKey: true,
					createdAt: true,
				},
			});

			return c.json({ user }, 201);
		} catch (error) {
			console.error("Error creating user:", error);
			return c.json({ error: "Failed to create user" }, 500);
		}
	});

	// Update user
	app.patch("/api/users/:id", validateToken, async (c) => {
		try {
			const id = c.req.param("id");
			const { name, email, password } = await c.req.json();

			// Check if user exists
			const existingUser = await prisma.user.findUnique({
				where: { id },
			});

			if (!existingUser) {
				return c.json({ error: "User not found" }, 404);
			}

			// Check if email is taken by another user
			if (email && email !== existingUser.email) {
				const emailTaken = await prisma.user.findUnique({
					where: { email },
				});

				if (emailTaken) {
					return c.json({ error: "A user with this email already exists" }, 400);
				}
			}

			// Prepare update data
			const updateData: any = {};
			if (name) updateData.name = name;
			if (email) updateData.email = email;
			if (password) {
				updateData.password = await bcrypt.hash(password, 10);
			}

			// Update user
			const user = await prisma.user.update({
				where: { id },
				data: updateData,
				select: {
					id: true,
					name: true,
					email: true,
					apiKey: true,
					createdAt: true,
				},
			});

			return c.json({ user });
		} catch (error) {
			console.error("Error updating user:", error);
			return c.json({ error: "Failed to update user" }, 500);
		}
	});

	// Delete user(s)
	app.delete("/api/users", validateToken, async (c) => {
		try {
			const { ids } = await c.req.json();
			const currentUser = c.get("user");

			if (!ids || !Array.isArray(ids) || ids.length === 0) {
				return c.json({ error: "User IDs are required" }, 400);
			}

			// Check if user is trying to delete themselves
			if (ids.includes(currentUser.userId)) {
				return c.json({ error: "You cannot delete your own user account" }, 400);
			}

			// Check if users have associated data
			const usersWithBackups = await prisma.user.findMany({
				where: { id: { in: ids } },
				select: {
					id: true,
					backups: { take: 1 },
				},
			});

			const usersWithData = usersWithBackups.filter(
				(u) => u.backups.length > 0,
			);

			if (usersWithData.length > 0) {
				return c.json(
					{
						error:
							"These users cannot be deleted because they have associated data in the system",
					},
					400,
				);
			}

			// Delete users
			await prisma.user.deleteMany({
				where: { id: { in: ids } },
			});

			return c.json({ success: true, deleted: ids.length });
		} catch (error) {
			console.error("Error deleting users:", error);
			return c.json({ error: "Failed to delete users" }, 500);
		}
	});
}
