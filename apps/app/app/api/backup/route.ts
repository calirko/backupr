import { getPrismaClient, validateToken } from "@/lib/server/api-helpers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// GET /api/backup - Get all backups with pagination, filters, and ordering
export async function GET(request: NextRequest) {
	try {
		// Authenticate the request
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
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic query building requires any type
		const where: any = {};
		if (filters.status) {
			where.status = filters.status;
		}
		if (filters.backupName) {
			where.backupName = filters.backupName;
		}
		if (filters.client_name) {
			where.client = {
				name: filters.client_name,
			};
		}

		const [backups, total] = await Promise.all([
			prisma.backup.findMany({
				where,
				skip,
				take,
				orderBy,
				include: {
					client: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
					user: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
					files: {
						select: {
							id: true,
							filePath: true,
							fileSize: true,
							status: true,
						},
					},
					_count: {
						select: {
							files: true,
						},
					},
				},
			}),
			prisma.backup.count({ where }),
		]);

		// Map the backups to include filesCount and convert BigInt to string
		const backupsWithCount = backups.map((backup) => ({
			...backup,
			filesCount: backup._count.files,
			totalSize: backup.totalSize ? backup.totalSize.toString() : "0",
			files: backup.files.map((f) => ({
				...f,
				fileSize: f.fileSize.toString(),
			})),
		}));

		return NextResponse.json({ data: backupsWithCount, total });
	} catch (error) {
		console.error("Error fetching backups:", error);
		return NextResponse.json(
			{ error: "Failed to fetch backups" },
			{ status: 500 },
		);
	}
}

// DELETE /api/backup - Delete multiple backups
export async function DELETE(request: NextRequest) {
	try {
		// Authenticate the request
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
				{ error: "Backup IDs are required" },
				{ status: 400 },
			);
		}

		// Delete backups (files will be cascaded)
		await prisma.backup.deleteMany({
			where: { id: { in: ids } },
		});

		return NextResponse.json({ success: true, deleted: ids.length });
	} catch (error) {
		console.error("Error deleting backups:", error);
		return NextResponse.json(
			{ error: "Failed to delete backups" },
			{ status: 500 },
		);
	}
}
