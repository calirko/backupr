// lib/config.ts
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export interface AgentConfig {
	serverUrl?: string;
	agentToken?: string;
}

export class ConfigManager {
	private static readonly FILE_NAME = "backupr.conf";
	private static readonly FILE_PATH = path.join(process.cwd(), this.FILE_NAME);

	/**
	 * Reads the config file and returns whatever is in it.
	 * Never throws due to missing fields — validation is the caller's job.
	 */
	static async load(): Promise<AgentConfig> {
		if (!existsSync(this.FILE_PATH)) {
			// Write a minimal template so the user knows what to fill in
			await this.write({});
			console.log(
				`\x1b[33m[Config] Created config file: ${this.FILE_PATH}\x1b[0m`,
			);
			console.log(
				`\x1b[33m[Config] Run: agent setup <agentCode> to configure.\x1b[0m`,
			);
			return {};
		}

		try {
			const content = await fs.readFile(this.FILE_PATH, "utf-8");
			return JSON.parse(content) as AgentConfig;
		} catch (error) {
			console.error(
				"\x1b[31m[Config] Failed to parse config file:\x1b[0m",
				error instanceof Error ? error.message : error,
			);
			process.exit(1);
		}
	}

	/**
	 * Merges `partial` into the current config and persists only truthy values.
	 * Fields explicitly set to `undefined` are removed from the file.
	 */
	static async update(partial: Partial<AgentConfig>): Promise<AgentConfig> {
		const current = await this.load();
		const merged: AgentConfig = { ...current, ...partial };
		await this.write(merged);
		return merged;
	}

	/**
	 * Writes a config object to disk, omitting any keys with falsy values
	 * so the file stays clean (no empty strings / nulls).
	 */
	private static async write(config: AgentConfig): Promise<void> {
		// Strip out keys whose value is falsy (empty string, undefined, null)
		const clean = Object.fromEntries(
			Object.entries(config).filter(([, v]) => Boolean(v)),
		);

		try {
			await fs.writeFile(
				this.FILE_PATH,
				JSON.stringify(clean, null, 2),
				"utf-8",
			);
		} catch (error) {
			console.error(
				"\x1b[31m[Config] Failed to write config:\x1b[0m",
				error instanceof Error ? error.message : error,
			);
			process.exit(1);
		}
	}
}
