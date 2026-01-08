import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { getPrismaClient, errorResponse } from "@/lib/server/api-helpers";
import { Token } from "@/lib/server/token";

export async function POST(request: NextRequest) {
	try {
		const prisma = getPrismaClient();
		const { email, password } = await request.json();

		// Validate input
		if (!email || !password) {
			return NextResponse.json(
				{ error: "Email and password are required" },
				{ status: 400 }
			);
		}

		// Find user by email
		const user = await prisma.user.findUnique({
			where: { email },
		});

		if (!user) {
			return NextResponse.json(
				{ error: "Invalid email or password" },
				{ status: 401 }
			);
		}

		// Verify password
		const isPasswordValid = await bcrypt.compare(password, user.password);

		if (!isPasswordValid) {
			return NextResponse.json(
				{ error: "Invalid email or password" },
				{ status: 401 }
			);
		}

		// Generate JWT token
		const token = await Token.encrypt({
			userId: user.id,
			email: user.email,
			name: user.name,
		});

		return NextResponse.json({
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
		return errorResponse(error, "Login error");
	}
}
