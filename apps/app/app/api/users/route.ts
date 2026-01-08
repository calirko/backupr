import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPrismaClient, validateToken, errorResponse } from "@/lib/server/api-helpers";

export async function GET(request: NextRequest) {
	try {
		const validation = await validateToken(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status }
			);
		}

		const prisma = getPrismaClient();
		const { searchParams } = new URL(request.url);
		
		const skip = parseInt(searchParams.get("skip") || "0", 10);
		const take = parseInt(searchParams.get("take") || "30", 10);
		const filtersParam = searchParams.get("filters");
		const orderByParam = searchParams.get("orderBy");

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

		return NextResponse.json({ data: users, total });
	} catch (error) {
		return errorResponse(error, "Error fetching users");
	}
}

export async function POST(request: NextRequest) {
	try {
		const validation = await validateToken(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status }
			);
		}

		const prisma = getPrismaClient();
		const { name, email, password } = await request.json();

		// Validate required fields
		if (!name || !email || !password) {
			return NextResponse.json(
				{ error: "Name, email, and password are required" },
				{ status: 400 }
			);
		}

		// Check if user with email already exists
		const existingUser = await prisma.user.findUnique({
			where: { email },
		});

		if (existingUser) {
			return NextResponse.json(
				{ error: "A user with this email already exists" },
				{ status: 400 }
			);
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

		return NextResponse.json({ user }, { status: 201 });
	} catch (error) {
		return errorResponse(error, "Error creating user");
	}
}

export async function DELETE(request: NextRequest) {
	try {
		const validation = await validateToken(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status }
			);
		}

		const prisma = getPrismaClient();
		const { user: currentUser } = validation;
		const { ids } = await request.json();

		if (!ids || !Array.isArray(ids) || ids.length === 0) {
			return NextResponse.json({ error: "User IDs are required" }, { status: 400 });
		}

		// Check if user is trying to delete themselves
		if (ids.includes(currentUser.userId)) {
			return NextResponse.json(
				{ error: "You cannot delete your own user account" },
				{ status: 400 }
			);
		}

		// Check if users have associated data
		const usersWithBackups = await prisma.user.findMany({
			where: { id: { in: ids } },
			select: {
				id: true,
				backups: { take: 1 },
			},
		});

		const usersWithData = usersWithBackups.filter((u) => u.backups.length > 0);

		if (usersWithData.length > 0) {
			return NextResponse.json(
				{
					error:
						"These users cannot be deleted because they have associated data in the system",
				},
				{ status: 400 }
			);
		}

		// Delete users
		await prisma.user.deleteMany({
			where: { id: { in: ids } },
		});

		return NextResponse.json({ success: true, deleted: ids.length });
	} catch (error) {
		return errorResponse(error, "Error deleting users");
	}
}
