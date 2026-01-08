import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { Token } from "./token";

// Singleton Prisma client
let prisma: PrismaClient;

export function getPrismaClient(): PrismaClient {
	if (!prisma) {
		prisma = new PrismaClient();
	}
	return prisma;
}

// Global type for upload sessions
// NOTE: In-memory storage is used for simplicity in development.
// For production deployments, consider using Redis or database storage
// to ensure session persistence across serverless function invocations.
declare global {
	var uploadSessions: Map<string, any>;
}

global.uploadSessions = global.uploadSessions || new Map();

// Helper to get backup storage directory
export function getBackupStorageDir(): string {
	return process.env.BACKUP_STORAGE_DIR || "/tmp/backups";
}

// Middleware to validate API key
export async function validateApiKey(request: NextRequest) {
	const apiKey = request.headers.get("X-API-Key");

	if (!apiKey) {
		return { error: "API key required", status: 401 };
	}

	const prisma = getPrismaClient();
	const client = await prisma.client.findUnique({
		where: { apiKey },
	});

	if (!client) {
		return { error: "Invalid API key", status: 401 };
	}

	return { client };
}

// Middleware to validate JWT token
export async function validateToken(request: NextRequest) {
	const authHeader = request.headers.get("Authorization");

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return { error: "No token provided", status: 401 };
	}

	const token = authHeader.substring(7);
	const payload = await Token.decrypt(token);

	if (!payload) {
		return { error: "Invalid or expired token", status: 401 };
	}

	return { user: payload };
}

// Helper to create JSON response
export function jsonResponse(data: any, status = 200) {
	return NextResponse.json(data, { status });
}

// Helper to handle errors
export function errorResponse(error: any, defaultMessage = "Internal server error") {
	console.error(defaultMessage, error);
	const message = error instanceof Error ? error.message : defaultMessage;
	return NextResponse.json({ error: message }, { status: 500 });
}
