const fs = require("node:fs");
const path = require("node:path");
const archiver = require("archiver");

const TEMP_DIR = path.join(process.cwd(), ".temp");

function validateFilePaths(filePaths) {
	const invalidFiles = [];

	for (const filePath of filePaths) {
		try {
			if (!fs.existsSync(filePath)) {
				invalidFiles.push({ path: filePath, reason: "File does not exist" });
				continue;
			}

			const stats = fs.statSync(filePath);
			if (!stats.isFile()) {
				invalidFiles.push({ path: filePath, reason: "Path is not a file" });
			}
		} catch (error) {
			invalidFiles.push({
				path: filePath,
				reason: `Error checking file: ${error.message}`,
			});
		}
	}

	if (invalidFiles.length > 0) {
		const errorMessage = invalidFiles
			.map((file) => `${file.path} - ${file.reason}`)
			.join("\n");
		throw new Error(
			`The following files are invalid and cannot be backed up:\n${errorMessage}`,
		);
	}
}

async function generateZip({ paths, backupName, onProgress }) {
	let zipPath;

	try {
		// Validate all files before proceeding
		validateFilePaths(paths);

		if (!fs.existsSync(TEMP_DIR)) {
			fs.mkdirSync(TEMP_DIR, { recursive: true });
		}

		zipPath = path.join(TEMP_DIR, `${backupName}.zip`);

		if (fs.existsSync(zipPath)) {
			fs.unlinkSync(zipPath);
		}

		await createZipFromFiles(paths, zipPath, onProgress);

		return zipPath;
	} catch (error) {
		if (zipPath && fs.existsSync(zipPath)) {
			try {
				fs.unlinkSync(zipPath);
			} catch (cleanupError) {
				console.error(`Failed to clean up partial zip file:`, cleanupError);
			}
		}
		throw error;
	}
}

function calculateTotalSize(filePaths) {
	let totalSize = 0;
	for (const filePath of filePaths) {
		try {
			if (fs.existsSync(filePath)) {
				const stats = fs.statSync(filePath);
				if (stats.isFile()) {
					totalSize += stats.size;
				}
			}
		} catch {
			// skip
		}
	}
	return totalSize;
}

function createZipFromFiles(filePaths, outputPath, onProgress) {
	return new Promise((resolve, reject) => {
		const output = fs.createWriteStream(outputPath);
		const archive = archiver("zip", {
			zlib: { level: 6 },
			highWaterMark: 1024 * 1024,
		});

		const totalBytes = calculateTotalSize(filePaths);
		let processedBytes = 0;
		let lastProgressUpdate = 0;
		const throttleMs = 500;
		let destroyed = false;

		const cleanup = (error) => {
			if (destroyed) return;
			destroyed = true;
			archive.destroy();
			output.destroy();
			reject(error);
		};

		output.on("close", () => {
			if (!destroyed) {
				if (onProgress) {
					onProgress(100);
				}
				resolve();
			}
		});

		output.on("error", (error) => cleanup(error));
		archive.on("error", (error) => cleanup(error));

		archive.on("warning", (warning) => {
			if (warning.code !== "ENOENT") {
				cleanup(warning);
			}
		});

		archive.on("data", (chunk) => {
			if (destroyed || !onProgress || totalBytes <= 0) return;

			processedBytes += chunk.length;
			const now = Date.now();
			if (now - lastProgressUpdate >= throttleMs) {
				const progress = Math.min(
					Math.round((processedBytes / totalBytes) * 100),
					99,
				);
				onProgress(progress);
				lastProgressUpdate = now;
			}
		});

		archive.pipe(output);

		for (const filePath of filePaths) {
			if (!fs.existsSync(filePath)) {
				continue;
			}

			const fileName = path.basename(filePath);
			try {
				archive.file(filePath, { name: fileName });
			} catch {
				// skip
			}
		}

		archive.finalize();
	});
}

function deleteZipTemp(zipPath) {
	try {
		if (zipPath && fs.existsSync(zipPath)) {
			fs.unlinkSync(zipPath);
		}
	} catch (error) {
		console.error(`Failed to delete zip file ${zipPath}:`, error);
		throw error;
	}
}

module.exports = {
	generateZip,
	deleteZipTemp,
};
