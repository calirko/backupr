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

// ─── Tunables ───────────────────────────────────────────────────────────────

// Throttle progress callbacks to avoid spamming the WS channel.
const PROGRESS_THROTTLE_MS = 250;

// Per-LZMA2-thread memory cost ≈ dictionary size × ~11 (compress) / × ~1 (decompress).
// We pick dictionary based on level and clamp threads so total RAM stays sane.
// e.g. dict=64m at level 7 → ~700 MB per thread → 8 threads ≈ 5.6 GB. We cap accordingly.
const MAX_COMPRESSION_RAM_BYTES = (() => {
	const total = os.totalmem();
	// Use up to 60% of system RAM, but leave at least 2 GB for the OS / other work.
	const cap = Math.max(total * 0.6, total - 2 * 1024 ** 3);
	return Math.max(cap, 512 * 1024 ** 2); // never less than 512 MB
})();

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

// ─── Compression tuning ─────────────────────────────────────────────────────

interface CompressionTuning {
	threads: number;
	dictionarySize: string; // e.g. "64m"
	solidBlockSize: string; // e.g. "4g"
	wordSize: number;
}

function tuneCompression(level: number): CompressionTuning {
	// Dictionary size by level (LZMA2 defaults are conservative; we go bigger).
	// These match 7-Zip's own "ultra" tier where appropriate.
	const dictByLevel: Record<number, string> = {
		1: "64k",
		2: "1m",
		3: "4m",
		4: "16m",
		5: "32m", // 7z default
		6: "32m",
		7: "64m",
		8: "128m",
		9: "256m", // ultra
	};

	const wordByLevel: Record<number, number> = {
		1: 32,
		2: 32,
		3: 32,
		4: 32,
		5: 64,
		6: 64,
		7: 128,
		8: 256,
		9: 273,
	};

	const dictionarySize = dictByLevel[level] ?? "32m";
	const wordSize = wordByLevel[level] ?? 64;

	// Estimate RAM per thread (compression cost ≈ 11× dictionary).
	const dictBytes = parseSize(dictionarySize);
	const ramPerThread = dictBytes * 11;

	const cpuThreads = Math.max(1, os.cpus().length);
	const ramThreads = Math.max(
		1,
		Math.floor(MAX_COMPRESSION_RAM_BYTES / ramPerThread),
	);
	const threads = Math.min(cpuThreads, ramThreads);

	// Solid block: bigger = better ratio, but slower random access.
	// 4 GB is a reasonable default for backup archives.
	const solidBlockSize = "4g";

	return { threads, dictionarySize, solidBlockSize, wordSize };
}

function parseSize(s: string): number {
	const m = s.match(/^(\d+)\s*([kmgKMG]?)$/);
	if (!m) return 0;
	const n = parseInt(m[1], 10);
	const unit = m[2].toLowerCase();
	switch (unit) {
		case "k":
			return n * 1024;
		case "m":
			return n * 1024 ** 2;
		case "g":
			return n * 1024 ** 3;
		default:
			return n;
	}
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

// ─── Input size helper ───────────────────────────────────────────────────────

function statSize(p: string): number {
	const s = fs.statSync(p);
	if (!s.isDirectory()) return s.size;
	let total = 0;
	for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
		try {
			total += statSize(path.join(p, entry.name));
		} catch {}
	}
	return total;
}

function computeInputSize(files: string[]): number {
	let total = 0;
	for (const f of files) {
		try {
			total += statSize(f);
		} catch {}
	}
	return total;
}

// ─── Compression ────────────────────────────────────────────────────────────

function compressWithProgress(
	archivePath: string,
	inputSizeBytes: number,
	args: string[],
	onPct: (pct: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const binary = resolve7zBinary();
		const proc = spawn(binary, args, {
			stdio: ["ignore", "ignore", "pipe"],
		});

		let stderrBuf = "";
		let lastPct = -1;

		// Poll the growing archive file instead of parsing 7z stdout, which
		// suppresses progress output when not connected to a tty.
		const pollInterval = setInterval(() => {
			try {
				const archiveSize = fs.statSync(archivePath).size;
				if (inputSizeBytes > 0) {
					const pct = Math.min(
						99,
						Math.round((archiveSize / inputSizeBytes) * 100),
					);
					if (pct > lastPct) {
						lastPct = pct;
						onPct(pct);
					}
				}
			} catch {
				// archive not created yet
			}
		}, 500);

		proc.stderr?.on("data", (chunk: Buffer) => {
			stderrBuf += chunk.toString("utf8");
		});

		proc.on("error", (err: NodeJS.ErrnoException) => {
			clearInterval(pollInterval);
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
			clearInterval(pollInterval);
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
	const tuning = tuneCompression(level);

	console.log(
		`[Backup] Compression tuning: level=${level}, threads=${tuning.threads}, ` +
			`dict=${tuning.dictionarySize}, word=${tuning.wordSize}, ` +
			`solid=${tuning.solidBlockSize}`,
	);

	const args = [
		"a",
		"-t7z",
		"-y",
		"-bso0", // suppress normal stdout (we poll file size for progress)
		"-bse2", // errors → stderr
		`-mx=${level}`,
		`-mmt=${tuning.threads}`,
		`-md=${tuning.dictionarySize}`,
		`-mfb=${tuning.wordSize}`,
		`-ms=${tuning.solidBlockSize}`,
		archivePath,
		...files,
	];

	if (job.use_password && job.password) {
		args.push(`-p${job.password}`);
		args.push("-mhe=on"); // encrypt headers too
	}

	return args;
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
	const archivePath = path.join(
		os.tmpdir(),
		`backupr_${job.id}_${Date.now()}.7z`,
	);

	try {
		const level = Math.max(1, Math.min(9, job.compression_level));
		const sevenZipArgs = buildSevenZipArgs(archivePath, job.files, level, job);

		const inputSizeBytes = computeInputSize(job.files);
		const startCompress = Date.now();
		console.log(
			`[Backup] Starting compression (level ${level}, input ${formatBytes(inputSizeBytes)})...`,
		);
		onProgress?.("compressing 0%");
		await compressWithProgress(archivePath, inputSizeBytes, sevenZipArgs, (pct) => {
			onProgress?.(`compressing ${pct}%`);
		});

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
