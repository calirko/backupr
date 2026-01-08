import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function POST(request: NextRequest) {
	try {
		const formData = await request.formData();
		const sessionId = formData.get("sessionId") as string;
		const chunkIndex = parseInt(formData.get("chunkIndex") as string, 10);
		const chunk = formData.get("chunk") as File;

		if (!sessionId || chunkIndex === undefined || !chunk) {
			return NextResponse.json(
				{
					error: "sessionId, chunkIndex, and chunk are required",
				},
				{ status: 400 }
			);
		}

		global.uploadSessions = global.uploadSessions || new Map();
		const session = global.uploadSessions.get(sessionId);

		if (!session) {
			return NextResponse.json({ error: "Invalid session ID" }, { status: 404 });
		}

		// Write chunk to temporary file
		const chunkPath = join(session.tempFolder, `chunk_${chunkIndex}`);
		const buffer = Buffer.from(await chunk.arrayBuffer());
		await writeFile(chunkPath, buffer);

		session.uploadedChunks++;

		return NextResponse.json({
			success: true,
			uploadedChunks: session.uploadedChunks,
			totalChunks: session.totalChunks,
		});
	} catch (error) {
		console.error("Chunk upload error:", error);
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json(
			{ error: "Failed to upload chunk", details: errorMessage },
			{ status: 500 }
		);
	}
}
