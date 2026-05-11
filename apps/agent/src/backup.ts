import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ConfigManager } from "./lib/config";

interface BackupJobPayload {
	id: string; // backup ID
	jobId: string; // backup job ID (needed for upload)
	files: string[];
	compression_level: number;
	use_password: boolean;
	password?: string;
}

// Throttle progress callbacks to avoid spamming the WS channel.
const PROGRESS_THROTTLE_MS = 250;

// ─── 7z resolution (cross-platform) ─────────────────────────────────────────

let cached7zPath: string | null = null;

function resolve7zBinary(): string {
	if (cached7zPath) return cached7zPath;

	const isWindows = process.platform === "win32";
	const candidates: string[] = [];

	if (isWindows) {
		candidates.push(
			"7z.exe",
			"7za.exe",
			"C:\\Program Files\\7-Zip\\7z.exe",
			"C:\\Program Files (x86)\\7-Zip\\7z.exe",
		);
	} else {
		candidates.push("7z", "7za", "/usr/bin/7z", "/usr/local/bin/7z");
	}

	for (const candidate of candidates) {
		// Absolute paths: stat the file directly.
		if (path.isAbsolute(candidate)) {
			if (fs.existsSync(candidate)) {
				cached7zPath = candidate;
				return candidate;
			}
			continue;
		}
		// Bare names: trust PATH lookup. spawn() will surface ENOENT if missing,
		// which we handle in compressWithProgress.
		cached7zPath = candidate;
		return candidate;
	}

	throw new Error(
		"7-Zip not found. Install p7zip (Linux) or 7-Zip (Windows) and ensure it's on PATH.",
	);
}


function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

// ─── Compression ────────────────────────────────────────────────────────────

function compressWithProgress(
	args: string[],
	onPct: (pct: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const binary = resolve7zBinary();
		const proc = spawn(binary, args, {
			// stdout captures -bsp1 progress lines; stderr captures -bse2 errors
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdoutTail = "";
		let stderrBuf = "";
		let lastPct = -1;

		proc.stdout?.on("data", (chunk: Buffer) => {
			// Keep a small rolling tail to handle percentages split across chunks
			const text = stdoutTail + chunk.toString("utf8");
			const matches = text.match(/(\d+)%/g);
			if (matches) {
				const pct = parseInt(matches[matches.length - 1]);
				if (!isNaN(pct) && pct > lastPct) {
					lastPct = pct;
					onPct(Math.min(99, pct));
				}
			}
			stdoutTail = text.slice(-20);
		});

		proc.stderr?.on("data", (chunk: Buffer) => {
			stderrBuf += chunk.toString("utf8");
		});

		proc.on("error", (err: NodeJS.ErrnoException) => {
			if (err.code === "ENOENT") {
				reject(
					new Error(
						"7-Zip binary not found on PATH. Install p7zip (Linux) or 7-Zip (Windows).",
					),
				);
			} else {
				reject(err);
			}
		});

		proc.on("close", (code) => {
			if (code === 0) {
				onPct(100);
				resolve();
			} else {
				const tail = stderrBuf.trim().split("\n").slice(-5).join("\n");
				reject(
					new Error(`7z exited with code ${code}${tail ? `\n${tail}` : ""}`),
				);
			}
		});
	});
}

function buildSevenZipArgs(
	archivePath: string,
	files: string[],
	level: number,
	job: BackupJobPayload,
): string[] {
	console.log(`[Backup] Compression: level=${level}, threads=auto`);

	const args = [
		"a",
		"-t7z",
		"-y",
		"-bso0", // suppress normal output messages
		"-bsp1", // progress percentages → stdout
		"-bse2", // errors → stderr
		`-mx=${level}`,
		"-mmt=on", // let 7z pick thread count based on available CPUs
		archivePath,
		...files,
	];

	if (job.use_password && job.password) {
		args.push(`-p${job.password}`);
		args.push("-mhe=on"); // encrypt headers too
	}

	return args;
}

// ─── VSS (Windows Volume Shadow Copy) ────────────────────────────────────────
// Creates a point-in-time volume snapshot so files that are open/being written
// (e.g. Firebird .fdb, SQL Server .mdf) are copied in a consistent state.

async function runPowerShell(script: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = spawn(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-Command", script],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		let stdout = "";
		let stderr = "";
		proc.stdout?.on("data", (c: Buffer) => { stdout += c; });
		proc.stderr?.on("data", (c: Buffer) => { stderr += c; });
		proc.on("error", reject);
		proc.on("close", (code) => {
			if (code === 0) resolve(stdout.trim());
			else reject(new Error(stderr.trim() || `exit ${code}`));
		});
	});
}

async function createVSSShadow(volume: string): Promise<string | null> {
	try {
		const escaped = volume.replace(/'/g, "''");
		const out = await runPowerShell(
			`$r = ([WMICLASS]"root\\cimv2:win32_shadowcopy").Create('${escaped}', 'ClientAccessible'); ` +
			`if ($r.ReturnValue -ne 0) { exit 1 }; ` +
			`(Get-WmiObject Win32_ShadowCopy -Filter "ID='$($r.ShadowID)'").DeviceObject`,
		);
		return out.startsWith("\\") ? out : null;
	} catch (err) {
		console.warn(`[Backup] VSS failed for ${volume}: ${err instanceof Error ? err.message : err}`);
		return null;
	}
}

async function deleteVSSShadow(deviceObject: string): Promise<void> {
	try {
		const escaped = deviceObject.replace(/'/g, "''");
		await runPowerShell(
			`$s = Get-WmiObject Win32_ShadowCopy | Where-Object { $_.DeviceObject -eq '${escaped}' }; ` +
			`if ($s) { $s.Delete() | Out-Null }`,
		);
	} catch {
		// best-effort
	}
}

function shadowResolvePath(filePath: string, volumeToDevice: Map<string, string>): string {
	const vol = path.parse(filePath).root;
	const device = volumeToDevice.get(vol);
	if (!device) return filePath;
	// e.g. C:\foo\bar.fdb → \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1\foo\bar.fdb
	return device + "\\" + filePath.slice(vol.length);
}

// ─── Staging ─────────────────────────────────────────────────────────────────

async function stageFiles(files: string[], stageDir: string): Promise<string[]> {
	fs.mkdirSync(stageDir, { recursive: true });
	const staged: string[] = [];

	const volumeToDevice = new Map<string, string>();
	const shadowDevices: string[] = [];

	if (process.platform === "win32") {
		const volumes = new Set(files.map((f) => path.parse(f).root).filter(Boolean));
		for (const vol of volumes) {
			console.log(`[Backup] Creating VSS shadow copy for ${vol}...`);
			const device = await createVSSShadow(vol);
			if (device) {
				volumeToDevice.set(vol, device);
				shadowDevices.push(device);
				console.log(`[Backup] VSS shadow ready: ${device}`);
			} else {
				console.warn(
					`[Backup] VSS unavailable for ${vol} — copying live files (consistency not guaranteed)`,
				);
			}
		}
	}

	try {
		for (let i = 0; i < files.length; i++) {
			const src = files[i];
			const resolved =
				process.platform === "win32"
					? shadowResolvePath(src, volumeToDevice)
					: src;
			const dest = path.join(stageDir, `${i}_${path.basename(src)}`);
			const viaVSS = resolved !== src;

			try {
				const stat = fs.statSync(resolved);
				if (stat.isDirectory()) {
					fs.cpSync(resolved, dest, { recursive: true, force: true, errorOnExist: false });
				} else {
					fs.copyFileSync(resolved, dest);
				}
				staged.push(dest);
				console.log(
					`[Backup] Staged: ${src} → ${dest}${viaVSS ? " (VSS snapshot)" : ""}`,
				);
			} catch (err) {
				console.warn(
					`[Backup] Could not stage ${src}: ${err instanceof Error ? err.message : err}`,
				);
			}
		}
	} finally {
		for (const device of shadowDevices) {
			console.log(`[Backup] Releasing VSS shadow: ${device}`);
			await deleteVSSShadow(device);
		}
	}

	return staged;
}

// ─── Upload ─────────────────────────────────────────────────────────────────

async function uploadBackupArchive(
	archivePath: string,
	backupId: string,
	jobId: string,
	onPct?: (pct: number) => void,
): Promise<void> {
	const config = await ConfigManager.load();
	if (!config.serverUrl || !config.agentToken) {
		throw new Error("Agent not configured (missing serverUrl or agentToken)");
	}

	const fileSize = fs.statSync(archivePath).size;
	console.log(
		`[Backup] Uploading archive ${backupId} (${formatBytes(fileSize)}) to server...`,
	);

	let uploaded = 0;
	let lastPct = -1;
	let lastEmit = 0;

	// Pause the stream immediately so it only reads when the consumer is ready,
	// preventing unbounded buffering if the network is slower than disk.
	const nodeStream = fs.createReadStream(archivePath, {
		highWaterMark: 1024 * 1024, // 1 MB chunks — friendlier to slow networks
	});
	nodeStream.pause();

	const body = new ReadableStream<Buffer>({
		start(controller) {
			nodeStream.on("data", (chunk: Buffer) => {
				nodeStream.pause();
				uploaded += chunk.length;
				if (onPct && fileSize > 0) {
					const pct = Math.min(100, Math.round((uploaded / fileSize) * 100));
					const now = Date.now();
					if (
						pct !== lastPct &&
						(pct === 100 || now - lastEmit >= PROGRESS_THROTTLE_MS)
					) {
						lastPct = pct;
						lastEmit = now;
						onPct(pct);
					}
				}
				controller.enqueue(chunk);
			});
			nodeStream.on("end", () => controller.close());
			nodeStream.on("error", (e) => controller.error(e));
		},
		pull() {
			nodeStream.resume();
		},
		cancel() {
			nodeStream.destroy();
		},
	});

	const response = await fetch(`${config.serverUrl}/agent/upload`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${config.agentToken}`,
			"X-Backup-Id": backupId,
			"X-Backup-Job-Id": jobId,
			"Content-Length": fileSize.toString(),
			"X-Requires-Password": "false",
			"Content-Type": "application/octet-stream",
		},
		body,
		// @ts-ignore - duplex needed for streaming request body in some runtimes
		duplex: "half",
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Upload failed (${response.status}): ${text}`);
	}

	console.log(`[Backup] Upload completed successfully (${response.status})`);
}

// ─── Public entry point ─────────────────────────────────────────────────────

export async function runBackupJob(
	job: BackupJobPayload,
	onProgress?: (message: string) => void,
): Promise<void> {
	const tmpBase = path.join(os.tmpdir(), `backupr_${job.id}_${Date.now()}`);
	const stageDir = `${tmpBase}_stage`;
	const archivePath = `${tmpBase}.7z`;

	try {
		console.log(`[Backup] Staging ${job.files.length} path(s) to ${stageDir}...`);
		onProgress?.("staging files...");
		const stagedPaths = await stageFiles(job.files, stageDir);

		if (stagedPaths.length === 0) {
			throw new Error("No files could be staged for backup.");
		}

		const level = Math.max(1, Math.min(9, job.compression_level));
		const sevenZipArgs = buildSevenZipArgs(archivePath, stagedPaths, level, job);

		const startCompress = Date.now();
		console.log(`[Backup] Starting compression (level ${level})...`);
		onProgress?.("compressing 0%");
		await compressWithProgress(sevenZipArgs, (pct) => {
			onProgress?.(`compressing ${pct}%`);
		});

		safeDeleteDir(stageDir);

		const archiveSize = fs.statSync(archivePath).size;
		const compressSec = (Date.now() - startCompress) / 1000;
		console.log(
			`[Backup] Compression complete: ${formatBytes(archiveSize)} in ${compressSec.toFixed(1)}s ` +
				`(${formatBytes(archiveSize / compressSec)}/s)`,
		);

		const startUpload = Date.now();
		onProgress?.("uploading 0%");
		await uploadBackupArchive(archivePath, job.id, job.jobId, (pct) => {
			onProgress?.(`uploading ${pct}%`);
		});
		const uploadSec = (Date.now() - startUpload) / 1000;
		console.log(
			`[Backup] Upload complete in ${uploadSec.toFixed(1)}s ` +
				`(${formatBytes(archiveSize / uploadSec)}/s)`,
		);
	} finally {
		safeDeleteDir(stageDir);
		safeDeleteFile(archivePath);
	}
}

function safeDeleteFile(filePath: string): void {
	try {
		fs.rmSync(filePath, { force: true });
	} catch {
		// best-effort cleanup
	}
}

function safeDeleteDir(dirPath: string): void {
	try {
		fs.rmSync(dirPath, { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}
}
