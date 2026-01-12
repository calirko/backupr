import { validateApiKey } from "@/lib/server/api-helpers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
	try {
		const validation = await validateApiKey(request);
		if ("error" in validation) {
			const response = NextResponse.json(
				{ error: validation.error },
				{ status: validation.status },
			);
			// Add CORS headers
			response.headers.set("Access-Control-Allow-Origin", "*");
			response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
			response.headers.set(
				"Access-Control-Allow-Headers",
				"X-API-Key, Content-Type",
			);
			return response;
		}

		const { client } = validation;

		const response = NextResponse.json({
			success: true,
			message: "Connection successful",
			clientName: client.name,
			timestamp: new Date().toISOString(),
		});

		// Add CORS headers
		response.headers.set("Access-Control-Allow-Origin", "*");
		response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
		response.headers.set(
			"Access-Control-Allow-Headers",
			"X-API-Key, Content-Type",
		);

		return response;
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		const response = NextResponse.json(
			{ error: "Ping failed", details: errorMessage },
			{ status: 500 },
		);
		// Add CORS headers even for errors
		response.headers.set("Access-Control-Allow-Origin", "*");
		response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
		response.headers.set(
			"Access-Control-Allow-Headers",
			"X-API-Key, Content-Type",
		);
		return response;
	}
}

export async function OPTIONS() {
	const response = new NextResponse(null, { status: 204 });
	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
	response.headers.set(
		"Access-Control-Allow-Headers",
		"X-API-Key, Content-Type",
	);
	return response;
}
