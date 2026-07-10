import { createHash, createHmac } from "node:crypto";
import type { Readable } from "node:stream";
import { Client } from "minio";

const ENDPOINT = process.env.MINIO_ENDPOINT ?? "localhost";
const PORT = parseInt(process.env.MINIO_PORT ?? "9000");
const USE_SSL = process.env.MINIO_USE_SSL === "true";
const ACCESS_KEY = process.env.MINIO_ACCESS_KEY ?? "minioadmin";
const SECRET_KEY = process.env.MINIO_SECRET_KEY ?? "minioadmin";
const REGION = process.env.MINIO_REGION ?? "us-east-1";
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

export async function getMinIOFreeBytes(): Promise<bigint | null> {
	try {
		const protocol = USE_SSL ? "https" : "http";
		const standardPort = USE_SSL ? 443 : 80;
		const host = PORT === standardPort ? ENDPOINT : `${ENDPOINT}:${PORT}`;
		const path = "/minio/admin/v3/storageinfo";

		const isoStr = new Date()
			.toISOString()
			.replace(/[-:]/g, "")
			.replace(/\.\d{3}Z$/, "Z");
		const dateStr = isoStr.slice(0, 8);

		const emptyHash = createHash("sha256").update("").digest("hex");
		const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${emptyHash}\nx-amz-date:${isoStr}\n`;
		const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
		const canonicalReq = [
			"GET",
			path,
			"",
			canonicalHeaders,
			signedHeaders,
			emptyHash,
		].join("\n");

		const credScope = `${dateStr}/${REGION}/s3/aws4_request`;
		const stringToSign = [
			"AWS4-HMAC-SHA256",
			isoStr,
			credScope,
			createHash("sha256").update(canonicalReq).digest("hex"),
		].join("\n");

		const kDate = createHmac("sha256", `AWS4${SECRET_KEY}`)
			.update(dateStr)
			.digest();
		const kRegion = createHmac("sha256", kDate).update(REGION).digest();
		const kService = createHmac("sha256", kRegion).update("s3").digest();
		const kSigning = createHmac("sha256", kService)
			.update("aws4_request")
			.digest();
		const signature = createHmac("sha256", kSigning)
			.update(stringToSign)
			.digest("hex");

		const authorization = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

		const res = await fetch(`${protocol}://${host}${path}`, {
			headers: {
				host,
				"x-amz-date": isoStr,
				"x-amz-content-sha256": emptyHash,
				authorization,
			},
		});

		if (!res.ok) return null;

		const data = (await res.json()) as {
			Disks?: Array<{ availspace?: number }>;
		};

		console.log(data);

		const disks = data.Disks;
		if (!disks?.length) return null;

		let totalAvail = 0n;
		for (const disk of disks) {
			totalAvail += BigInt(disk.availspace ?? 0);
		}
		console.log(totalAvail);
		return totalAvail > 0n ? totalAvail : null;
	} catch (e) {
		console.log(e);
		return null;
	}
}
