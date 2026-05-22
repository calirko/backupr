import { AgentStatusEnum } from "../prisma/generated/prisma/enums";
import { prisma } from "./lib/prisma";
import {
	agentRegistry,
	setOnAgentConnect,
	setOnAgentDisconnect,
	setOnAgentBackupStatus,
} from "./ws.agent";
import { scheduler } from "./scheduler";

const db = prisma;

const RETENTION_DAYS = 7;

async function recordStatus(agentId: string, status: AgentStatusEnum): Promise<void> {
	await db.agentStatus.create({
		data: { agent_id: agentId, status, date: new Date() },
	});
}

async function recordAgentConnect(agentId: string): Promise<void> {
	await recordStatus(agentId, AgentStatusEnum.ONLINE);
}

async function recordAgentDisconnect(agentId: string): Promise<void> {
	await recordStatus(agentId, AgentStatusEnum.OFFLINE);
}

async function recordAgentBackupStatus(agentId: string, rawStatus: string): Promise<void> {
	const lower = rawStatus.toLowerCase();

	if (lower === "running") {
		await recordStatus(agentId, AgentStatusEnum.RUNNING_BACKUP);
		return;
	}

	if (lower === "failed") {
		await recordStatus(agentId, AgentStatusEnum.FAILED_BACKUP);
	}

	// After backup ends (completed or failed), immediately record current connectivity
	// so the UI transitions cleanly from backup state → online/offline
	const isOnline = agentRegistry.has(agentId);
	await recordStatus(agentId, isOnline ? AgentStatusEnum.ONLINE : AgentStatusEnum.OFFLINE);
}

// ─── Periodic snapshot ───────────────────────────────────────────────────────

async function snapshotAllActiveAgents(): Promise<void> {
	const entries = [...agentRegistry.values()];
	if (entries.length === 0) return;

	const now = new Date();
	await db.agentStatus.createMany({
		data: entries.map((state) => ({
			agent_id: state.agentId,
			status: state.currentJob ? AgentStatusEnum.RUNNING_BACKUP : AgentStatusEnum.ONLINE,
			date: now,
		})),
	});

	console.log(`[AgentStatus] Snapshotted ${entries.length} active agent(s).`);
}

async function snapshotOfflineAgents(): Promise<void> {
	// Get all agents that were ever created
	const allAgents = await db.agent.findMany({
		where: { deleted_at: null },
		select: { id: true },
	});

	// Get agents currently online
	const onlineAgentIds = new Set([...agentRegistry.keys()]);

	// Find offline agents
	const offlineAgents = allAgents.filter((a) => !onlineAgentIds.has(a.id));
	if (offlineAgents.length === 0) return;

	const now = new Date();
	await db.agentStatus.createMany({
		data: offlineAgents.map((agent) => ({
			agent_id: agent.id,
			status: AgentStatusEnum.OFFLINE,
			date: now,
		})),
	});

	console.log(`[AgentStatus] Snapshotted ${offlineAgents.length} offline agent(s).`);
}

// ─── Purge ───────────────────────────────────────────────────────────────────

async function purgeOldAgentStatuses(): Promise<void> {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

	const { count } = await db.agentStatus.deleteMany({
		where: { date: { lt: cutoff } },
	});

	if (count > 0) {
		console.log(`[AgentStatus] Purged ${count} old agent status record(s).`);
	}
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

export function initAgentStatusTracking(): void {
	setOnAgentConnect((agentId) => {
		recordAgentConnect(agentId).catch((err) =>
			console.error(`[AgentStatus] Failed to record connect for ${agentId}:`, err),
		);
	});

	setOnAgentDisconnect((agentId) => {
		recordAgentDisconnect(agentId).catch((err) =>
			console.error(`[AgentStatus] Failed to record disconnect for ${agentId}:`, err),
		);
	});

	setOnAgentBackupStatus((agentId, status) => {
		recordAgentBackupStatus(agentId, status).catch((err) =>
			console.error(`[AgentStatus] Failed to record backup status for ${agentId}:`, err),
		);
	});

	scheduler.register({
		name: "snapshot-agent-statuses",
		intervalMs: 10 * 60_000,
		fn: async () => {
			await snapshotAllActiveAgents();
			await snapshotOfflineAgents();
		},
	});

	scheduler.register({
		name: "purge-old-agent-statuses",
		intervalMs: 60 * 60_000,
		fn: purgeOldAgentStatuses,
	});
}
