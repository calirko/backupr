#!/usr/bin/env bun
import { Command } from "commander";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import { mkdir } from "fs/promises";
import { join } from "path";

const prisma = new PrismaClient();
const program = new Command();

// Generate a secure API key
function generateApiKey(): string {
	return randomBytes(32).toString("hex");
}

// Get the backup storage directory from env or default
const BACKUP_STORAGE_DIR =
	process.env.BACKUP_STORAGE_DIR || join(process.cwd(), "backups");

program
	.name("backupr-cli")
	.description("Backupr Server CLI for managing sync clients")
	.version("1.0.0");

program
	.command("add-client")
	.description("Add a new sync client and generate an API key")
	.requiredOption(
		"-n, --name <name>",
		"Client name (used for folder organization)",
	)
	.option("-e, --email <email>", "Client email (optional)")
	.action(async (options) => {
		try {
			const { name, email } = options;

			// Validate name
			if (!name || name.trim().length === 0) {
				console.error("❌ Error: Client name cannot be empty");
				process.exit(1);
			}

			// Check if client with this name already exists
			const existingClient = await prisma.client.findUnique({
				where: { name: name.trim() },
			});

			if (existingClient) {
				console.error(`❌ Error: Client with name "${name}" already exists`);
				process.exit(1);
			}

			// Generate API key
			const apiKey = generateApiKey();

			// Create client folder path
			const clientFolderPath = join(BACKUP_STORAGE_DIR, name.trim());

			// Create the client folder
			await mkdir(clientFolderPath, { recursive: true });

			// Create client in database
			const client = await prisma.client.create({
				data: {
					name: name.trim(),
					email: email?.trim() || null,
					apiKey,
					folderPath: clientFolderPath,
				},
			});

			console.log("\n✅ Client created successfully!\n");
			console.log("━".repeat(60));
			console.log(`Client Name:  ${client.name}`);
			if (client.email) {
				console.log(`Email:        ${client.email}`);
			}
			console.log(`API Key:      ${client.apiKey}`);
			console.log(`Folder Path:  ${client.folderPath}`);
			console.log(`Created:      ${client.createdAt.toISOString()}`);
			console.log("━".repeat(60));
			console.log(
				"\n⚠️  IMPORTANT: Save this API key! It cannot be retrieved later.\n",
			);
		} catch (error) {
			console.error("❌ Error creating client:", error.message);
			process.exit(1);
		} finally {
			await prisma.$disconnect();
		}
	});

program
	.command("list-clients")
	.description("List all registered sync clients")
	.option("-v, --verbose", "Show detailed information including API keys")
	.action(async (options) => {
		try {
			const clients = await prisma.client.findMany({
				orderBy: { createdAt: "desc" },
				include: {
					_count: {
						select: { backups: true },
					},
				},
			});

			if (clients.length === 0) {
				console.log("\nNo clients registered yet.\n");
				return;
			}

			console.log(`\n📋 Total Clients: ${clients.length}\n`);
			console.log("━".repeat(80));

			for (const client of clients) {
				console.log(`\nClient: ${client.name}`);
				console.log(`  ID:           ${client.id}`);
				if (client.email) {
					console.log(`  Email:        ${client.email}`);
				}
				console.log(`  Backups:      ${client._count.backups}`);
				console.log(`  Folder:       ${client.folderPath}`);
				console.log(`  Created:      ${client.createdAt.toISOString()}`);
				if (options.verbose) {
					console.log(`  API Key:      ${client.apiKey}`);
				}
				console.log("━".repeat(80));
			}
			console.log();
		} catch (error) {
			console.error("❌ Error listing clients:", error.message);
			process.exit(1);
		} finally {
			await prisma.$disconnect();
		}
	});

program
	.command("remove-client")
	.description(
		"Remove a sync client (WARNING: This will delete all associated backups)",
	)
	.requiredOption("-n, --name <name>", "Client name to remove")
	.option("-f, --force", "Skip confirmation prompt")
	.action(async (options) => {
		try {
			const { name, force } = options;

			const client = await prisma.client.findUnique({
				where: { name: name.trim() },
				include: {
					_count: {
						select: { backups: true },
					},
				},
			});

			if (!client) {
				console.error(`❌ Error: Client "${name}" not found`);
				process.exit(1);
			}

			if (!force) {
				console.log(`\n⚠️  WARNING: This will permanently delete:`);
				console.log(`   - Client: ${client.name}`);
				console.log(`   - ${client._count.backups} backup(s)`);
				console.log(`   - Folder: ${client.folderPath}`);
				console.log(`\nTo proceed, run the command with --force flag\n`);
				process.exit(0);
			}

			// Delete client (cascades to backups and files)
			await prisma.client.delete({
				where: { id: client.id },
			});

			console.log(`\n✅ Client "${client.name}" removed successfully\n`);
			console.log(
				`⚠️  Note: Physical files in ${client.folderPath} should be manually deleted if needed.\n`,
			);
		} catch (error) {
			console.error("❌ Error removing client:", error.message);
			process.exit(1);
		} finally {
			await prisma.$disconnect();
		}
	});

program
	.command("regenerate-key")
	.description("Regenerate API key for a client")
	.requiredOption("-n, --name <name>", "Client name")
	.action(async (options) => {
		try {
			const { name } = options;

			const client = await prisma.client.findUnique({
				where: { name: name.trim() },
			});

			if (!client) {
				console.error(`❌ Error: Client "${name}" not found`);
				process.exit(1);
			}

			const newApiKey = generateApiKey();

			const updatedClient = await prisma.client.update({
				where: { id: client.id },
				data: { apiKey: newApiKey },
			});

			console.log("\n✅ API Key regenerated successfully!\n");
			console.log("━".repeat(60));
			console.log(`Client Name:  ${updatedClient.name}`);
			console.log(`New API Key:  ${updatedClient.apiKey}`);
			console.log("━".repeat(60));
			console.log(
				"\n⚠️  IMPORTANT: Update the client application with this new API key.\n",
			);
		} catch (error) {
			console.error("❌ Error regenerating API key:", error.message);
			process.exit(1);
		} finally {
			await prisma.$disconnect();
		}
	});

program
	.command("client-info")
	.description("Show detailed information about a client")
	.requiredOption("-n, --name <name>", "Client name")
	.action(async (options) => {
		try {
			const { name } = options;

			const client = await prisma.client.findUnique({
				where: { name: name.trim() },
				include: {
					backups: {
						orderBy: { timestamp: "desc" },
						take: 5,
						select: {
							id: true,
							timestamp: true,
							status: true,
							filesCount: true,
							totalSize: true,
							backupName: true,
						},
					},
					_count: {
						select: { backups: true },
					},
				},
			});

			if (!client) {
				console.error(`❌ Error: Client "${name}" not found`);
				process.exit(1);
			}

			console.log("\n📊 Client Information\n");
			console.log("━".repeat(80));
			console.log(`Name:           ${client.name}`);
			console.log(`ID:             ${client.id}`);
			if (client.email) {
				console.log(`Email:          ${client.email}`);
			}
			console.log(`API Key:        ${client.apiKey}`);
			console.log(`Folder Path:    ${client.folderPath}`);
			console.log(`Total Backups:  ${client._count.backups}`);
			console.log(`Created:        ${client.createdAt.toISOString()}`);
			console.log(`Last Updated:   ${client.updatedAt.toISOString()}`);

			if (client.backups.length > 0) {
				console.log("\n📦 Recent Backups (Last 5):");
				console.log("━".repeat(80));
				for (const backup of client.backups) {
					console.log(
						`\n  ${backup.backupName || "Unnamed"} (${backup.status})`,
					);
					console.log(`    ID:        ${backup.id}`);
					console.log(`    Timestamp: ${backup.timestamp.toISOString()}`);
					console.log(`    Files:     ${backup.filesCount}`);
					console.log(
						`    Size:      ${(backup.totalSize / 1024 / 1024).toFixed(2)} MB`,
					);
				}
			}

			console.log("\n" + "━".repeat(80) + "\n");
		} catch (error) {
			console.error("❌ Error fetching client info:", error.message);
			process.exit(1);
		} finally {
			await prisma.$disconnect();
		}
	});

program.parse(process.argv);
