import type { Readable } from "node:stream";
import { Client } from "minio";

const ENDPOINT = process.env.MINIO_ENDPOINT ?? "localhost";
const PORT = parseInt(process.env.MINIO_PORT ?? "9000");
const USE_SSL = process.env.MINIO_USE_SSL === "true";
const ACCESS_KEY = process.env.MINIO_ACCESS_KEY ?? "minioadmin";
const SECRET_KEY = process.env.MINIO_SECRET_KEY ?? "minioadmin";
export const BUCKET = process.env.MINIO_BUCKET ?? "backupr";

export const storage = new Client({
	endPoint: ENDPOINT,
	port: PORT,
	useSSL: USE_SSL,
	accessKey: ACCESS_KEY,
	secretKey: SECRET_KEY,
});

export async function ensureBucket(): Promise<void> {
	const exists = await storage.bucketExists(BUCKET);
	if (!exists) {
		await storage.makeBucket(BUCKET, "us-east-1");
		console.log(`[storage] Created bucket: ${BUCKET}`);
	}
	console.log(`[storage] Bucket exists: ${BUCKET}`);
}

export async function uploadStream(
	key: string,
	stream: Readable | Buffer,
	size?: number,
	contentType = "application/octet-stream",
): Promise<void> {
	await storage.putObject(BUCKET, key, stream, size, {
		"Content-Type": contentType,
	});
}

// Returns a presigned GET URL valid for the given duration (seconds).
// Default: 7 days (MaxAllowed by MinIO with static credentials).
export async function presignedDownloadUrl(
	key: string,
	expiresInSeconds = 604800,
	filename?: string,
): Promise<string> {
	const reqParams: Record<string, string> = {};
	if (filename) {
		reqParams["response-content-disposition"] =
			`attachment; filename="${filename}"`;
	}
	return storage.presignedGetObject(BUCKET, key, expiresInSeconds, reqParams);
}

export async function presignedPutUrl(
	key: string,
	expiresInSeconds = 3600,
): Promise<string> {
	return storage.presignedPutObject(BUCKET, key, expiresInSeconds);
}

export async function removeObject(key: string): Promise<void> {
	await storage.removeObject(BUCKET, key);
}
