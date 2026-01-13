import { getPrismaClient, validateToken } from "@/lib/server/api-helpers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// GET /api/logs - Get all logs with pagination, filters, and ordering
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
		const take = parseInt(searchParams.get("take") || "100", 10);
		const filtersParam = searchParams.get("filters");
		const orderByParam = searchParams.get("orderBy");

		// Parse filters and orderBy if provided
		const filters = filtersParam
			? JSON.parse(decodeURIComponent(filtersParam))
			: {};
		const orderBy = orderByParam
			? JSON.parse(decodeURIComponent(orderByParam))
			: { timestamp: "desc" };

		// Build where clause from filters
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic query building requires any type
		const where: any = {};
		if (filters.action) {
			where.action = filters.action;
		}
		if (filters.status) {
			where.status = filters.status;
		}

		const [logs, total] = await Promise.all([
			prisma.syncLog.findMany({
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
				},
			}),
			prisma.syncLog.count({ where }),
		]);

		return NextResponse.json({ data: logs, total });
	} catch (error) {
		console.error("Error fetching logs:", error);
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json(
			{ error: "Failed to fetch logs", details: errorMessage },
			{ status: 500 },
		);
	}
}
