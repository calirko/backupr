import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export interface AgentConfig {
	serverUrl: string;
	agentToken: string;
	agentCode: string;
}

export class ConfigManager {
	private static readonly FILE_NAME = "backupr.conf";
	private static readonly FILE_PATH = path.join(process.cwd(), this.FILE_NAME);

	private static readonly DEFAULT_CONFIG: AgentConfig = {
		serverUrl: "http://localhost:5174",
		agentToken: "",
		agentCode: "",
	};

	static async load(): Promise<AgentConfig> {
		try {
			if (!existsSync(this.FILE_PATH)) {
				await this.save(this.DEFAULT_CONFIG);
				console.log(
					`\x1b[33m[Config] Created new config file: ${this.FILE_PATH}\x1b[0m`,
				);
				console.log(
					`\x1b[33m[Config] Please edit the file and add your agent token.\x1b[0m`,
				);
			}

			const content = await fs.readFile(this.FILE_PATH, "utf-8");
			const config = JSON.parse(content) as AgentConfig;

			// Basic validation
			if (!config.serverUrl || !config.agentToken) {
				throw new Error(
					"Invalid config: serverUrl and agentToken are required.",
				);
			}

			return config;
		} catch (error) {
			console.error(
				"\x1b[31m[Config] Error loading config:\x1b[0m",
				error instanceof Error ? error.message : error,
			);
			process.exit(1);
		}
	}

	static async save(config: AgentConfig): Promise<void> {
		try {
			const content = JSON.stringify(config, null, 2);
			await fs.writeFile(this.FILE_PATH, content, "utf-8");
		} catch (error) {
			console.error("\x1b[31m[Config] Failed to save config:\x1b[0m", error);
		}
	}

	static async update(partial: Partial<AgentConfig>): Promise<AgentConfig> {
		const current = await this.load();
		const updated = { ...current, ...partial };
		await this.save(updated);
		return updated;
	}
}
