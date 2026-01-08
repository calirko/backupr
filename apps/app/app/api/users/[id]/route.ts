import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { getPrismaClient, validateToken, errorResponse } from "@/lib/server/api-helpers";

export async function GET(
	request: NextRequest,
	{ params }: { params: { id: string } }
) {
	try {
		const validation = await validateToken(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status }
			);
		}

		const prisma = getPrismaClient();
		const { id } = params;

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
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		return NextResponse.json({ user });
	} catch (error) {
		return errorResponse(error, "Error fetching user");
	}
}

export async function PATCH(
	request: NextRequest,
	{ params }: { params: { id: string } }
) {
	try {
		const validation = await validateToken(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status }
			);
		}

		const prisma = getPrismaClient();
		const { id } = params;
		const { name, email, password } = await request.json();

		// Check if user exists
		const existingUser = await prisma.user.findUnique({
			where: { id },
		});

		if (!existingUser) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Check if email is taken by another user
		if (email && email !== existingUser.email) {
			const emailTaken = await prisma.user.findUnique({
				where: { email },
			});

			if (emailTaken) {
				return NextResponse.json(
					{ error: "A user with this email already exists" },
					{ status: 400 }
				);
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

		return NextResponse.json({ user });
	} catch (error) {
		return errorResponse(error, "Error updating user");
	}
}
