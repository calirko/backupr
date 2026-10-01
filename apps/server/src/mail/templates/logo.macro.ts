import { readFile } from "node:fs/promises";

/**
 * Bun macro: runs at bundle time (and on import under `bun run`), so the
 * logo is read from the web app's public folder instead of a pasted copy.
 */
export async function readLogoBase64(): Promise<string> {
	const path = new URL("../../../../web/public/icon.png", import.meta.url);
	return (await readFile(path)).toString("base64");
}
