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
		const { user: payload } = validation;

		// Get fresh user data
		const user = await prisma.user.findUnique({
			where: { id: payload.userId },
		});

		if (!user) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		return NextResponse.json({
			success: true,
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				apiKey: user.apiKey,
			},
		});
	} catch (error) {
		return errorResponse(error, "Verify token error");
	}
}
