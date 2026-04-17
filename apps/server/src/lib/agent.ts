const SERVER_URL = process.env.SERVER_URL || "http://localhost:5173";

export function generateAgentCode(): string {
	return btoa(
		JSON.stringify({
			serverUrl: SERVER_URL,
			agentCode: crypto.randomUUID(),
		}),
	);
}

export interface AgentToken {
	serverUrl: string;
	agentId: string;
	agentName: string;
}

export function generateAgentToken({
	agentName,
	agentId,
}: {
	agentName: string;
	agentId: string;
}): string {
	return btoa(
		JSON.stringify({
			serverUrl: SERVER_URL,
			agentId,
			agentName,
		}),
	);
}
