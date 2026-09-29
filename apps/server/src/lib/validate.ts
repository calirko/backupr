import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Thrown from handlers; the app's onError turns it into a JSON response. */
export class HttpError extends Error {
	constructor(
		public status: ContentfulStatusCode,
		message: string,
	) {
		super(message);
	}
}

type Body = Record<string, unknown>;

export async function readJson(c: Context): Promise<Body> {
	let json: unknown;
	try {
		json = await c.req.json();
	} catch {
		throw new HttpError(400, "Invalid JSON");
	}
	if (typeof json !== "object" || json === null || Array.isArray(json)) {
		throw new HttpError(400, "JSON body must be an object");
	}
	return json as Body;
}

interface Common {
	required?: boolean;
	nullable?: boolean;
}

function missing(body: Body, key: string, opts: Common) {
	const value = body[key];
	if (value === undefined || (value === null && !opts.nullable)) {
		if (opts.required) throw new HttpError(400, `"${key}" is required`);
		return true;
	}
	return false;
}

/**
 * Field readers. Each returns `undefined` when the field is absent (so PATCH
 * bodies only touch what was sent), `null` when explicitly nulled and
 * nullable, and throws a 400 on anything malformed.
 */
export const field = {
	string(
		body: Body,
		key: string,
		opts: Common & { min?: number; max?: number } = {},
	): string | null | undefined {
		if (missing(body, key, opts)) return undefined;
		const value = body[key];
		if (value === null) return null;
		if (typeof value !== "string") {
			throw new HttpError(400, `"${key}" must be a string`);
		}
		const trimmed = value.trim();
		if (trimmed.length < (opts.min ?? (opts.required ? 1 : 0))) {
			throw new HttpError(
				400,
				opts.min
					? `"${key}" must be at least ${opts.min} characters`
					: `"${key}" is required`,
			);
		}
		if (trimmed.length > (opts.max ?? 255)) {
			throw new HttpError(400, `"${key}" is too long`);
		}
		return trimmed;
	},

	boolean(body: Body, key: string, opts: Common = {}): boolean | undefined {
		if (missing(body, key, opts)) return undefined;
		if (typeof body[key] !== "boolean") {
			throw new HttpError(400, `"${key}" must be a boolean`);
		}
		return body[key] as boolean;
	},

	int(
		body: Body,
		key: string,
		opts: Common & { min?: number; max?: number } = {},
	): number | null | undefined {
		if (missing(body, key, opts)) return undefined;
		const value = body[key];
		if (value === null) return null;
		if (
			typeof value !== "number" ||
			!Number.isInteger(value) ||
			value < (opts.min ?? Number.MIN_SAFE_INTEGER) ||
			value > (opts.max ?? Number.MAX_SAFE_INTEGER)
		) {
			throw new HttpError(400, `"${key}" is out of range`);
		}
		return value;
	},

	stringArray(
		body: Body,
		key: string,
		opts: Common & { maxItems?: number; maxLength?: number } = {},
	): string[] | undefined {
		if (missing(body, key, opts)) return undefined;
		const value = body[key];
		if (
			!Array.isArray(value) ||
			value.length > (opts.maxItems ?? 100) ||
			value.some(
				(v) => typeof v !== "string" || v.length > (opts.maxLength ?? 1024),
			)
		) {
			throw new HttpError(400, `"${key}" must be a list of strings`);
		}
		if (opts.required && value.length === 0) {
			throw new HttpError(400, `"${key}" must not be empty`);
		}
		return value as string[];
	},
};

/** Drops undefined keys so Prisma only updates fields that were sent. */
export function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(obj).filter(([, v]) => v !== undefined),
	) as Partial<T>;
}

/**
 * A required route param. Hono types params as possibly undefined once
 * middleware is in the chain, and Prisma treats `{ id: undefined }` as "no
 * condition", so never let an undefined id reach a query.
 */
export function param(c: Context, name: string): string {
	const value = c.req.param(name);
	if (!value) throw new HttpError(400, `Missing "${name}" parameter`);
	return value;
}
