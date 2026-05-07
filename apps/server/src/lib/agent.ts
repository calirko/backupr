const SERVER_URL = process.env.SERVER_URL || "http://localhost:5174";

export function generateAgentCode(): { code: string; encoded: string } {
	const code = crypto.randomUUID();

	const encoded = btoa(
		JSON.stringify({
			serverUrl: SERVER_URL,
			agentCode: code,
		}),
	);

	return { code, encoded };
}

export interface AgentToken {
	serverUrl: string;
	agentId: string;
	agentName: string;
	sessionId: string;
}

// Update the generateAgentToken function to include sessionId
export function generateAgentToken({
	agentName,
	agentId,
	sessionId,
}: {
	agentName: string;
	agentId: string;
	sessionId: string;
}): string {
	return btoa(
		JSON.stringify({
			serverUrl: SERVER_URL,
			agentId,
			agentName,
			sessionId,
		}),
	);
}
