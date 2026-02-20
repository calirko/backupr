import { getPrismaClient, validateToken } from "@/lib/server/api-helpers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Disable Next.js body size limit – the response for this route can be delayed
// for as long as the client takes to run the backup, so we must not let the
// serverless/edge runtime cancel it.  When running under the custom server
// (server.js) this has no effect, but it documents intent.
export const maxDuration = 0;

// POST /api/backup/trigger
// Body: { clientId: string, backupName: string }
//
// Behaviour:
//  – Returns 503 immediately when the Electron client is not connected via WS
//    (the client needs to upgrade to a version that supports the WS channel).
//  – If another trigger for the same (clientId, backupName) is already in
//    flight, this request is queued and will resolve once that backup finishes.
//  – Otherwise sends a trigger-backup message over the WS connection and waits
//    for the client to reply before responding to the HTTP caller.
export async function POST(request: NextRequest) {
	try {
		// ── Auth ───────────────────────────────────────────────────────────────────
		const validation = await validateToken(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status },
			);
		}

		// ── Parse body ─────────────────────────────────────────────────────────────
		const body = await request.json().catch(() => null);
		const clientId: string | undefined = body?.clientId;
		const backupName: string | undefined = body?.backupName;

		if (!clientId || !backupName) {
			return NextResponse.json(
				{ error: "clientId and backupName are required" },
				{ status: 400 },
			);
		}

		// ── Resolve client → apiKey ────────────────────────────────────────────────
		const prisma = getPrismaClient();
		const client = await prisma.client.findUnique({ where: { id: clientId } });
		if (!client) {
			return NextResponse.json({ error: "Client not found" }, { status: 404 });
		}

		// ── Check WebSocket connectivity ───────────────────────────────────────────
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const wsManager = require("../../../../lib/server/ws-manager");

		if (!wsManager.isClientConnected(client.apiKey)) {
			return NextResponse.json(
				{
					error:
						"Client is unavailable. This feature requires a newer version of the Backupr client to be running and connected.",
				},
				{ status: 503 },
			);
		}

		// ── Trigger (or join existing) backup ──────────────────────────────────────
		// Notify frontend subscribers that a backup is starting / already running
		wsManager.broadcastBackupStatus(clientId, backupName, "in_progress");

		try {
			// triggerClientBackup handles the lock: if one is already in progress for
			// this (clientId, backupName) it queues this caller and resolves together.
			await wsManager.triggerClientBackup(client.apiKey, backupName, clientId);
			wsManager.broadcastBackupStatus(clientId, backupName, "completed");
		} catch (triggerError: unknown) {
			wsManager.broadcastBackupStatus(clientId, backupName, "failed");
			throw triggerError;
		}

		return NextResponse.json({ success: true });
	} catch (error: unknown) {
		const message =
			error instanceof Error ? error.message : "Unknown error occurred";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
