// lib/server/backup-helpers.ts
import { createHash } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { Readable, Transform, TransformCallback } from "stream";
import { pipeline } from "stream/promises";

/**
 * Streams a ReadableStream to disk while computing SHA-256 checksum.
 * Memory usage stays constant regardless of file size.
 */
export async function streamToDiskWithChecksum(
	body: ReadableStream<Uint8Array>,
	destPath: string,
): Promise<{ fileSize: number; checksum: string }> {
	const hash = createHash("sha256");
	let fileSize = 0;

	// Transform that taps into the stream to hash + count bytes
	const hashTransform = new Transform({
		transform(
			chunk: Buffer,
			_encoding: BufferEncoding,
			callback: TransformCallback,
		) {
			fileSize += chunk.length;
			hash.update(chunk);
			callback(null, chunk);
		},
	});

	// Convert Web ReadableStream → Node Readable
	const nodeReadable = Readable.fromWeb(body as any);
	const writeStream = createWriteStream(destPath);

	// Pipe: request body → hash transform → file on disk
	await pipeline(nodeReadable, hashTransform, writeStream);

	return {
		fileSize,
		checksum: hash.digest("hex"),
	};
}

// Keep existing helpers for other use cases
export function calculateChecksum(buffer: Buffer): string {
	return createHash("sha256").update(buffer).digest("hex");
}

export function calculateChecksumFromFile(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", () => resolve(hash.digest("hex")));
		stream.on("error", reject);
	});
}
