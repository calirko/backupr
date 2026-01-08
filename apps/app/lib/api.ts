// Lightweight fetch wrapper for the frontend.
// - Uses NEXT_PUBLIC_API_URL or API_URL as the base URL by default.
// - Automatically JSON.stringify bodies when appropriate.
// - Centralized error handling and optional logging via NEXT_PUBLIC_FETCH_LOGS or per-call `log` option.
// - Exported helpers: Api.get, Api.post, Api.patch, Api.del

export type FetcherOptions = RequestInit & {
	baseUrl?: string;
	// when true, logs request/response to console
	log?: boolean;
	// skip treating body as JSON (useful for FormData)
	skipJson?: boolean;
	// when true (default), automatically adds Authorization Bearer token from cookies
	token?: string;
	// for when response is blob
	blob?: boolean;
};

export class FetchError extends Error {
	status: number;
	data: unknown;
	constructor(status: number, data: unknown) {
		super(
			(data as { message?: string })?.message ||
				`Request failed with status ${status}`,
		);
		this.name = "FetchError";
		this.status = status;
		this.data = data;
	}
}

async function fetcher<T = unknown>(
	path: string,
	opts: FetcherOptions = {},
): Promise<T> {
	const base =
		opts.baseUrl ?? ((process.env.NEXT_PUBLIC_API_URL as string) || "");
	const url = path.startsWith("http")
		? path
		: `${base.replace(/\/+$|$/, "")}/${path.replace(/^\/+/, "")}`;

	const headers = new Headers(opts.headers ?? {});

	// Add Authorization Bearer token if useToken is true (default)
	if (opts.token) {
		headers.set("Authorization", `Bearer ${opts.token}`);
	}

	// If not using FormData and not explicitly skipping JSON, set JSON content-type when absent
	if (
		!headers.has("Content-Type") &&
		!(opts.body instanceof FormData) &&
		!opts.skipJson
	) {
		headers.set("Content-Type", "application/json");
	}

	const reqInit: RequestInit = { ...opts, headers };

	// Stringify body when it's not already a string or FormData and content-type is json
	const contentType = headers.get("Content-Type") || "";
	if (
		reqInit.body != null &&
		typeof reqInit.body !== "string" &&
		!(reqInit.body instanceof FormData) &&
		contentType.includes("application/json")
	) {
		reqInit.body = JSON.stringify(reqInit.body);
	}

	// const shouldLog = opts.log ?? process.env.NEXT_PUBLIC_FETCH_LOGS === "true";
	// if (shouldLog)
	// 	console.info("[fetcher] ->", reqInit.method ?? "GET", url, {
	// 		headers: Object.fromEntries(headers.entries()),
	// 		body: reqInit.body,
	// 	});

	const res = await fetch(url, reqInit);

	const resContentType = res.headers.get("content-type") || "";
	let data: unknown = null;
	try {
		if (resContentType.includes("application/json") && res.status !== 204) {
			data = await res.json();
		} else if (opts.blob) {
			data = await res.blob();
		} else {
			data = await res.text();
		}
	} catch (_err) {
		// ignore parse errors and keep raw response
		data = null;
	}

	if (!res.ok) {
		// if (shouldLog) console.warn("[fetcher] error", res.status, data);
		throw new FetchError(res.status, data);
	}

	// if (shouldLog) console.info("[fetcher] <-", res.status, data);
	return data as T;
}

export type FetchBody = BodyInit | Record<string, unknown> | undefined;

export const Api = {
	get: <T = unknown>(path: string, opts?: FetcherOptions) =>
		fetcher<T>(path, { method: "GET", ...opts }),
	post: <T = unknown>(path: string, body?: FetchBody, opts?: FetcherOptions) =>
		fetcher<T>(path, {
			method: "POST",
			body: body as BodyInit,

			...opts,
		}),
	patch: <T = unknown>(path: string, body?: FetchBody, opts?: FetcherOptions) =>
		fetcher<T>(path, {
			method: "PATCH",
			body: body as BodyInit,

			...opts,
		}),
	del: <T = unknown>(path: string, body?: FetchBody, opts?: FetcherOptions) =>
		fetcher<T>(path, { method: "DELETE", body: body as BodyInit, ...opts }),
};

export default Api;
