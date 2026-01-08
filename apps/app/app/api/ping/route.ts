import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/server/api-helpers";

export async function GET(request: NextRequest) {
	try {
		const validation = await validateApiKey(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status }
			);
		}

		const { client } = validation;

		return NextResponse.json({
			success: true,
			message: "Connection successful",
			clientName: client.name,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json(
			{ error: "Ping failed", details: errorMessage },
			{ status: 500 }
		);
	}
}
