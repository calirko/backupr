import { PrismaClient } from "@prisma/client";
import type { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { validateToken } from "../lib/auth-middleware";

const prisma = new PrismaClient();

export function setupClientsRoutes(app: Hono) {
	// Get all clients (with pagination, filters, ordering)
	app.get("/api/clients", validateToken, async (c) => {
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
			if (filters.name) {
				where.name = { contains: filters.name, mode: "insensitive" };
			}
			if (filters.email) {
				where.email = { contains: filters.email, mode: "insensitive" };
			}

			const [clients, total] = await Promise.all([
				prisma.client.findMany({
					where,
					skip,
					take,
					orderBy,
					select: {
						id: true,
						name: true,
						email: true,
						folderPath: true,
						createdAt: true,
						updatedAt: true,
						_count: {
							select: {
								backups: true,
							},
						},
					},
				}),
				prisma.client.count({ where }),
			]);

			return c.json({ data: clients, total });
		} catch (error) {
			console.error("Error fetching clients:", error);
			return c.json({ error: "Failed to fetch clients" }, 500);
		}
	});

	// Get single client by ID
	app.get("/api/clients/:id", validateToken, async (c) => {
		try {
			const id = c.req.param("id");

			const client = await prisma.client.findUnique({
				where: { id },
				select: {
					id: true,
					name: true,
					email: true,
					folderPath: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			if (!client) {
				return c.json({ error: "Client not found" }, 404);
			}

			return c.json({ client });
		} catch (error) {
			console.error("Error fetching client:", error);
			return c.json({ error: "Failed to fetch client" }, 500);
		}
	});

	// Create new client
	app.post("/api/clients", validateToken, async (c) => {
		try {
			const { name, email, folderPath } = await c.req.json();

			// Validate required fields
			if (!name || !folderPath) {
				return c.json(
					{ error: "Name and folder path are required" },
					400,
				);
			}

			// Check if client with name already exists
			const existingClient = await prisma.client.findUnique({
				where: { name },
			});

			if (existingClient) {
				return c.json({ error: "A client with this name already exists" }, 400);
			}

			// Generate API key
			const apiKey = randomBytes(32).toString("hex");

			// Create client
			const client = await prisma.client.create({
				data: {
					name,
					email,
					folderPath,
					apiKey,
				},
				select: {
					id: true,
					name: true,
					email: true,
					folderPath: true,
					apiKey: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			return c.json({ client }, 201);
		} catch (error) {
			console.error("Error creating client:", error);
			return c.json({ error: "Failed to create client" }, 500);
		}
	});

	// Update client
	app.patch("/api/clients/:id", validateToken, async (c) => {
		try {
			const id = c.req.param("id");
			const { name, email, folderPath } = await c.req.json();

			// Check if client exists
			const existingClient = await prisma.client.findUnique({
				where: { id },
			});

			if (!existingClient) {
				return c.json({ error: "Client not found" }, 404);
			}

			// Check if name is taken by another client
			if (name && name !== existingClient.name) {
				const nameTaken = await prisma.client.findUnique({
					where: { name },
				});

				if (nameTaken) {
					return c.json({ error: "A client with this name already exists" }, 400);
				}
			}

			// Prepare update data
			const updateData: any = {};
			if (name) updateData.name = name;
			if (email !== undefined) updateData.email = email;
			if (folderPath) updateData.folderPath = folderPath;

			// Update client
			const client = await prisma.client.update({
				where: { id },
				data: updateData,
				select: {
					id: true,
					name: true,
					email: true,
					folderPath: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			return c.json({ client });
		} catch (error) {
			console.error("Error updating client:", error);
			return c.json({ error: "Failed to update client" }, 500);
		}
	});

	// Delete client(s)
	app.delete("/api/clients", validateToken, async (c) => {
		try {
			const { ids } = await c.req.json();

			if (!ids || !Array.isArray(ids) || ids.length === 0) {
				return c.json({ error: "Client IDs are required" }, 400);
			}

			// Check if clients have associated data
			const clientsWithBackups = await prisma.client.findMany({
				where: { id: { in: ids } },
				select: {
					id: true,
					backups: { take: 1 },
				},
			});

			const clientsWithData = clientsWithBackups.filter(
				(c) => c.backups.length > 0,
			);

			if (clientsWithData.length > 0) {
				return c.json(
					{
						error:
							"These clients cannot be deleted because they have associated data in the system",
					},
					400,
				);
			}

			// Delete clients
			await prisma.client.deleteMany({
				where: { id: { in: ids } },
			});

			return c.json({ success: true, deleted: ids.length });
		} catch (error) {
			console.error("Error deleting clients:", error);
			return c.json({ error: "Failed to delete clients" }, 500);
		}
	});
}
