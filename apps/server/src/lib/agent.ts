const SERVER_URL = process.env.SERVER_URL || "http://localhost:5173";

export default function generateAgentCode(): string {
	return btoa(
		JSON.stringify({
			serverUrl: SERVER_URL,
			agentCode: crypto.randomUUID(),
		}),
	);
}
