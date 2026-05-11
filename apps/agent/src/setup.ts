import os from "os";
import { version } from "../package.json" with { type: "json" };
import { ConfigManager } from "./lib/config";

export async function runSetup(agentCode: string): Promise<void> {
	console.log("[Setup] Pairing with server...");

	let decoded: { serverUrl: string; agentCode: string };

	try {
		decoded = JSON.parse(atob(agentCode));
		if (!decoded.serverUrl || !decoded.agentCode) {
			throw new Error("Decoded payload is missing serverUrl or agentCode.");
		}
	} catch (error) {
		console.error(
			"\x1b[31m[Setup] Invalid agent code (could not decode):\x1b[0m",
			error instanceof Error ? error.message : error,
		);
		process.exit(1);
	}

	const { serverUrl, agentCode: code } = decoded;

	try {
		const response = await fetch(`${serverUrl}/agents/pair`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				agentCode: code,
				name: os.hostname(),
				info: {
					platform: os.platform(),
					arch: os.arch(),
					release: os.release(),
					cpus: os.cpus().length,
					hostname: os.hostname(),
					agent_version: version,
				},
			}),
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(data.error || `Server returned ${response.status}`);
		}

		if (!data.token) {
			throw new Error("Server response did not include a token.");
		}

		// Derive the WebSocket base URL: replace the /api path suffix with /ws
		// so the agent uses the dedicated WS proxy rather than the HTTP proxy.
		// Falls back gracefully for bare origins (e.g. http://localhost:5174).
		const wsUrl = serverUrl
			.replace(/^http/, "ws")
			.replace(/\/api\/?$/, "");

		await ConfigManager.update({ serverUrl, wsUrl, agentToken: data.token });

		console.log(
			"\x1b[32m[Setup] Success! Agent registered and token saved.\x1b[0m",
		);
	} catch (error) {
		console.error(
			"\x1b[31m[Setup] Failed:\x1b[0m",
			error instanceof Error ? error.message : error,
		);
		process.exit(1);
	}
}
