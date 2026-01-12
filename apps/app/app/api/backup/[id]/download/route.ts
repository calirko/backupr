import { getPrismaClient, validateToken } from "@/lib/server/api-helpers";
import archiver from "archiver";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";

// GET /api/backup/[id]/download - Download backup files (single file or zipped archive)
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const prisma = getPrismaClient();
		const tokenQuery = request.nextUrl.searchParams.get("apiKey") || "";
		const validation = await validateToken(tokenQuery);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status },
			);
		}
		const { id: backupId } = await params;

		// Get the backup with all its files
		const backup = await prisma.backup.findUnique({
			where: { id: backupId },
			include: {
				files: true,
				client: {
					select: {
						id: true,
						name: true,
					},
				},
				user: {
					select: {
						id: true,
						name: true,
					},
				},
			},
		});

		if (!backup) {
			return NextResponse.json({ error: "Backup not found" }, { status: 404 });
		}

		if (!backup.files || backup.files.length === 0) {
			return NextResponse.json(
				{ error: "No files found in this backup" },
				{ status: 404 },
			);
		}

		// Get backup storage directory
		const BACKUP_STORAGE_DIR = process.env.BACKUP_STORAGE_DIR || "/bkp";
		const baseDir = join(
			BACKUP_STORAGE_DIR,
			backup.client?.name || backup.userId || "unknown",
			backup.backupName || "default",
		);

		// If there's only one file, return it directly (it's already a zip)
		if (backup.files.length === 1) {
			const backupFile = backup.files[0];
			const filePath = join(baseDir, backupFile.filePath);

			if (!existsSync(filePath)) {
				return NextResponse.json(
					{ error: "File not found on disk" },
					{ status: 404 },
				);
			}

			// Stream the single file
			const stream = createReadStream(filePath);
			const filename = backupFile.filePath.split("/").pop() || "backup.zip";

			// Convert Node.js stream to Web ReadableStream
			const readableStream = new ReadableStream({
				start(controller) {
					stream.on("data", (chunk: string | Buffer) => {
						controller.enqueue(
							new Uint8Array(
								typeof chunk === "string" ? Buffer.from(chunk) : chunk,
							),
						);
					});
					stream.on("end", () => {
						controller.close();
					});
					stream.on("error", (error) => {
						controller.error(error);
					});
				},
				cancel() {
					stream.destroy();
				},
			});

			return new Response(readableStream, {
				headers: {
					"Content-Type": "application/zip",
					"Content-Disposition": `attachment; filename="${filename}"`,
				},
			});
		}

		// Multiple files: create a zip archive
		const archive = archiver("zip", {
			zlib: { level: 9 }, // Maximum compression
		});

		// Check all files exist before starting
		for (const backupFile of backup.files) {
			const filePath = join(baseDir, backupFile.filePath);
			if (!existsSync(filePath)) {
				return NextResponse.json(
					{ error: `File not found on disk: ${backupFile.filePath}` },
					{ status: 404 },
				);
			}
		}

		// Add all files to the archive
		for (const backupFile of backup.files) {
			const filePath = join(baseDir, backupFile.filePath);
			const filename = backupFile.filePath.split("/").pop() || "file";
			archive.file(filePath, { name: filename });
		}

		// Finalize the archive
		archive.finalize();

		// Convert archiver stream to Web ReadableStream
		const readableStream = new ReadableStream({
			start(controller) {
				archive.on("data", (chunk: Buffer) => {
					controller.enqueue(new Uint8Array(chunk));
				});
				archive.on("end", () => {
					controller.close();
				});
				archive.on("error", (error) => {
					controller.error(error);
				});
			},
			cancel() {
				archive.destroy();
			},
		});

		const downloadFilename = `${backup.backupName || "backup"}_${backup.version || 1}.zip`;

		return new Response(readableStream, {
			headers: {
				"Content-Type": "application/zip",
				"Content-Disposition": `attachment; filename="${downloadFilename}"`,
			},
		});
	} catch (error) {
		console.error("Error downloading backup:", error);
		return NextResponse.json(
			{ error: "Failed to download backup" },
			{ status: 500 },
		);
	}
}
