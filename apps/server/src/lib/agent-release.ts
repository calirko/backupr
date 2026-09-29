// Latest published agent version, from the same GitHub endpoint the agent's
// self-updater uses. Cached so list requests never wait on GitHub more than
// once an hour; failures are cached briefly and simply mean "unknown".

const GITHUB_API_LATEST =
	"https://api.github.com/repos/calirko/backupr/releases/latest";
const CACHE_MS = 60 * 60_000;
const FAILURE_CACHE_MS = 10 * 60_000;

let cached: { version: string | null; expires: number } | null = null;
let inflight: Promise<string | null> | null = null;

async function fetchLatest(): Promise<string | null> {
	try {
		const res = await fetch(GITHUB_API_LATEST, {
			headers: {
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				"User-Agent": "backupr-server",
			},
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
		const { tag_name } = (await res.json()) as { tag_name?: string };
		const version = tag_name?.replace(/^v/, "") ?? null;
		cached = { version, expires: Date.now() + CACHE_MS };
		return version;
	} catch (err) {
		console.warn("[agent-release] Could not fetch latest agent version:", err);
		cached = { version: null, expires: Date.now() + FAILURE_CACHE_MS };
		return null;
	}
}

export async function getLatestAgentVersion(): Promise<string | null> {
	if (cached && cached.expires > Date.now()) return cached.version;
	inflight ??= fetchLatest().finally(() => {
		inflight = null;
	});
	return inflight;
}

/** Parses "v1.2.3" / "1.2.3-beta" the same way the agent does. */
function parseVersion(s: string): [number, number, number] | null {
	const m = s.trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
	return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isOutdated(current: string, latest: string): boolean {
	const a = parseVersion(current);
	const b = parseVersion(latest);
	if (!a || !b) return false;
	for (let i = 0; i < 3; i++) {
		if (a[i]! !== b[i]!) return a[i]! < b[i]!;
	}
	return false;
}
