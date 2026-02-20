import {
	errorResponse,
	getPrismaClient,
	validateToken,
} from "@/lib/server/api-helpers";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export async function GET(request: NextRequest) {
	try {
		const validation = await validateToken(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status },
			);
		}

		const prisma = getPrismaClient();
		const { searchParams } = new URL(request.url);

		const skip = parseInt(searchParams.get("skip") || "0", 10);
		const take = parseInt(searchParams.get("take") || "30", 10);
		const filtersParam = searchParams.get("filters");
		const orderByParam = searchParams.get("orderBy");

		// Parse filters and orderBy if provided
		const filters = filtersParam
			? JSON.parse(decodeURIComponent(filtersParam))
			: {};
		const orderBy = orderByParam
			? JSON.parse(decodeURIComponent(orderByParam))
			: { createdAt: "desc" };

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
					apiKey: true,
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

		return NextResponse.json({ data: clients, total });
	} catch (error) {
		return errorResponse(error, "Error fetching clients");
	}
}

export async function POST(request: NextRequest) {
	try {
		const validation = await validateToken(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status },
			);
		}

		const prisma = getPrismaClient();
		const { name, email } = await request.json();

		// Validate required fields
		if (!name) {
			return NextResponse.json({ error: "Name is required" }, { status: 400 });
		}

		// Check if client with name already exists
		const existingClient = await prisma.client.findUnique({
			where: { name },
		});

		if (existingClient) {
			return NextResponse.json(
				{ error: "A client with this name already exists" },
				{ status: 400 },
			);
		}

		// Generate API key
		const apiKey = randomBytes(32).toString("hex");

		// Auto-generate folder path based on client name
		const BACKUP_STORAGE_DIR = process.env.BACKUP_STORAGE_DIR || "/bkp";
		const sanitizedName = name
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");
		const folderPath = `${BACKUP_STORAGE_DIR}/${sanitizedName}`;

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

		return NextResponse.json({ client }, { status: 201 });
	} catch (error) {
		return errorResponse(error, "Error creating client");
	}
}

export async function DELETE(request: NextRequest) {
	try {
		const validation = await validateToken(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status },
			);
		}

		const prisma = getPrismaClient();
		const { ids } = await request.json();

		if (!ids || !Array.isArray(ids) || ids.length === 0) {
			return NextResponse.json(
				{ error: "Client IDs are required" },
				{ status: 400 },
			);
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
			return NextResponse.json(
				{
					error:
						"These clients cannot be deleted because they have associated data in the system",
				},
				{ status: 400 },
			);
		}

		// Delete clients
		await prisma.client.deleteMany({
			where: { id: { in: ids } },
		});

		return NextResponse.json({ success: true, deleted: ids.length });
	} catch (error) {
		return errorResponse(error, "Error deleting clients");
	}
}
