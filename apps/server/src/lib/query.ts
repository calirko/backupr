/**
 * Safe parsing of the list endpoints' `filters` / `orderBy` / `skip` / `take`
 * query params.
 *
 * The client sends Prisma-shaped JSON, which must never be passed to Prisma
 * as-is: a raw `where` lets any caller filter on columns it can't see (e.g.
 * `{"password":{"startsWith":"$2b$10$a"}}` or
 * `{"userSessions":{"some":{"token":{"startsWith":"ey"}}}}`) and brute-force
 * secrets one character at a time. Everything here is rebuilt from an
 * explicit per-endpoint allowlist of fields and operators.
 */

export class QueryError extends Error {}

type FieldType =
	| "string"
	| "id"
	| "boolean"
	| "number"
	| "date"
	| { enum: readonly string[] };

export interface ListSpec {
	/** Filterable fields; dot paths reach into to-one relations ("agent.name"). */
	filters: Record<string, FieldType>;
	/** Sortable fields, same dot-path syntax. */
	sort: readonly string[];
	/** Hard cap for `take`. */
	maxTake?: number;
}

export interface ListQuery {
	where: Record<string, unknown>;
	/** Validated sort as [path, direction] pairs, in priority order. */
	sort: [string, "asc" | "desc"][];
	skip?: number;
	take?: number;
}

const MAX_STRING = 200;
const DEFAULT_MAX_TAKE = 1000;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

function parseJsonParam(raw: string | undefined, name: string): unknown {
	if (!raw) return {};
	try {
		// The web client double-encodes (encodeURIComponent inside URLSearchParams)
		return JSON.parse(decodeURIComponent(raw));
	} catch {
		throw new QueryError(`Invalid ${name} parameter`);
	}
}

function setNested(obj: Record<string, unknown>, path: string, value: unknown) {
	const parts = path.split(".");
	const last = parts.pop()!;
	let target = obj;
	for (const part of parts) {
		if (!isPlainObject(target[part])) target[part] = {};
		target = target[part] as Record<string, unknown>;
	}
	target[last] = value;
}

function pickOps(
	value: Record<string, unknown>,
	allowed: readonly string[],
	path: string,
): Record<string, unknown> {
	const keys = Object.keys(value);
	if (keys.length === 0) throw new QueryError(`Empty filter for "${path}"`);
	for (const key of keys) {
		if (!allowed.includes(key)) {
			throw new QueryError(`Operator "${key}" is not allowed on "${path}"`);
		}
	}
	return value;
}

function str(v: unknown, path: string): string {
	if (typeof v !== "string" || v.length > MAX_STRING) {
		throw new QueryError(`Invalid value for "${path}"`);
	}
	return v;
}

function num(v: unknown, path: string): number {
	const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
	if (typeof n !== "number" || !Number.isFinite(n)) {
		throw new QueryError(`Invalid number for "${path}"`);
	}
	return n;
}

function date(v: unknown, path: string): Date {
	const d = typeof v === "string" ? new Date(v) : null;
	if (!d || Number.isNaN(d.getTime())) {
		throw new QueryError(`Invalid date for "${path}"`);
	}
	return d;
}

function validateValue(type: FieldType, value: unknown, path: string): unknown {
	if (typeof type === "object") {
		const check = (v: unknown) => {
			if (typeof v !== "string" || !type.enum.includes(v)) {
				throw new QueryError(`Invalid value for "${path}"`);
			}
			return v;
		};
		if (!isPlainObject(value)) return check(value);
		const ops = pickOps(value, ["equals", "not", "in"], path);
		const out: Record<string, unknown> = {};
		for (const [op, v] of Object.entries(ops)) {
			if (op === "in") {
				if (!Array.isArray(v) || v.length > type.enum.length) {
					throw new QueryError(`Invalid value for "${path}"`);
				}
				out.in = v.map(check);
			} else {
				out[op] = check(v);
			}
		}
		return out;
	}

	switch (type) {
		case "id":
			return str(value, path);

		case "string": {
			if (!isPlainObject(value)) return str(value, path);
			const ops = pickOps(
				value,
				["equals", "contains", "startsWith", "endsWith", "mode"],
				path,
			);
			const out: Record<string, unknown> = {};
			for (const [op, v] of Object.entries(ops)) {
				if (op === "mode") {
					if (v !== "insensitive" && v !== "default") {
						throw new QueryError(`Invalid mode for "${path}"`);
					}
					out.mode = v;
				} else {
					out[op] = str(v, path);
				}
			}
			return out;
		}

		case "boolean":
			if (value === true || value === "true") return true;
			if (value === false || value === "false") return false;
			throw new QueryError(`Invalid boolean for "${path}"`);

		case "number":
		case "date": {
			const convert = type === "number" ? num : date;
			if (!isPlainObject(value)) return convert(value, path);
			const ops = pickOps(value, ["equals", "gt", "gte", "lt", "lte"], path);
			const out: Record<string, unknown> = {};
			for (const [op, v] of Object.entries(ops)) out[op] = convert(v, path);
			return out;
		}
	}
}

function buildWhere(raw: unknown, spec: ListSpec): Record<string, unknown> {
	if (!isPlainObject(raw)) throw new QueryError("filters must be an object");
	const where: Record<string, unknown> = {};
	const paths = Object.keys(spec.filters);

	const walk = (obj: Record<string, unknown>, prefix: string) => {
		for (const [key, value] of Object.entries(obj)) {
			const path = prefix ? `${prefix}.${key}` : key;
			const type = spec.filters[path];
			if (type) {
				setNested(where, path, validateValue(type, value, path));
			} else if (
				isPlainObject(value) &&
				paths.some((p) => p.startsWith(`${path}.`))
			) {
				walk(value, path);
			} else {
				throw new QueryError(`Filtering by "${path}" is not allowed`);
			}
		}
	};
	walk(raw, "");
	return where;
}

function buildSort(raw: unknown, spec: ListSpec): [string, "asc" | "desc"][] {
	const entries = Array.isArray(raw) ? raw : [raw];
	const sort: [string, "asc" | "desc"][] = [];

	const walk = (obj: unknown, prefix: string) => {
		if (!isPlainObject(obj)) throw new QueryError("Invalid orderBy parameter");
		for (const [key, value] of Object.entries(obj)) {
			const path = prefix ? `${prefix}.${key}` : key;
			if (value === "asc" || value === "desc") {
				if (!spec.sort.includes(path)) {
					throw new QueryError(`Sorting by "${path}" is not allowed`);
				}
				sort.push([path, value]);
			} else if (spec.sort.some((p) => p.startsWith(`${path}.`))) {
				walk(value, path);
			} else {
				throw new QueryError(`Sorting by "${path}" is not allowed`);
			}
		}
	};
	for (const entry of entries) walk(entry, "");
	if (sort.length > 3) throw new QueryError("Too many sort fields");
	return sort;
}

function parseInteger(
	raw: string | undefined,
	name: string,
	min: number,
	max: number,
): number | undefined {
	if (raw === undefined || raw === "") return undefined;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < min) {
		throw new QueryError(`Invalid ${name} parameter`);
	}
	return Math.min(n, max);
}

export function parseListQuery(
	query: Record<string, string | undefined>,
	spec: ListSpec,
): ListQuery {
	return {
		where: buildWhere(parseJsonParam(query.filters, "filters"), spec),
		sort: buildSort(parseJsonParam(query.orderBy, "orderBy"), spec),
		skip: parseInteger(query.skip, "skip", 0, Number.MAX_SAFE_INTEGER),
		take: parseInteger(query.take, "take", 1, spec.maxTake ?? DEFAULT_MAX_TAKE),
	};
}

/** Turns validated sort pairs into a Prisma orderBy (or the fallback). */
export function toOrderBy(
	sort: ListQuery["sort"],
	fallback: Record<string, unknown>,
): Record<string, unknown>[] {
	if (sort.length === 0) return [fallback];
	return sort.map(([path, dir]) => {
		const obj: Record<string, unknown> = {};
		setNested(obj, path, dir);
		return obj;
	});
}
