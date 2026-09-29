import type { Hono } from "hono";
import { auth } from "../lib/auth";
import type { Prisma } from "../../prisma/generated/prisma/client";
import { Password } from "../lib/password";
import { prisma } from "../lib/prisma";
import { type ListSpec, parseListQuery, toOrderBy } from "../lib/query";
import { rateLimit } from "../lib/rate-limit";
import { defined, field, param, readJson } from "../lib/validate";

const db = prisma;

const MIN_PASSWORD_LENGTH = 8;

const listSpec: ListSpec = {
	filters: {
		name: "string",
		username: "string",
		email: "string",
		created_at: "date",
	},
	sort: [
		"name",
		"username",
		"email",
		"created_at",
		"updated_at",
		"receive_emails",
		"receive_weekly_report",
		"last_login_at",
	],
};

/**
 * Ids of the users matching `where`, ordered by their newest session (users
 * that never logged in last) and paginated. Sorted in memory: the user table is
 * small, and this keeps the filters on the regular Prisma `where`.
 */
async function userIdsByLastLogin(
	where: Prisma.UserWhereInput,
	dir: "asc" | "desc",
	skip = 0,
	take?: number,
): Promise<string[]> {
	const users = await db.user.findMany({ where, select: { id: true } });
	const lastLogins = await db.userSession.groupBy({
		by: ["user_id"],
		where: { user_id: { in: users.map((u) => u.id) } },
		_max: { created_at: true },
	});
	const lastLoginById = new Map(
		lastLogins.map((l) => [l.user_id, l._max.created_at?.getTime() ?? null]),
	);

	const sign = dir === "asc" ? 1 : -1;
	return users
		.map((u) => ({ id: u.id, at: lastLoginById.get(u.id) ?? null }))
		.sort((a, b) => {
			if (a.at === b.at) return a.id.localeCompare(b.id);
			if (a.at === null) return 1;
			if (b.at === null) return -1;
			return (a.at - b.at) * sign;
		})
		.slice(skip, take === undefined ? undefined : skip + take)
		.map((u) => u.id);
}

export default async function userRoutes(app: Hono) {
	// List Users (Paginated)
	app.get("/api/users", rateLimit, auth, async (c) => {
		const { where, sort, skip, take } = parseListQuery(c.req.query(), listSpec);
		const baseWhere = { ...where, deleted_at: null };

		// last_login_at is virtual (the newest session) and Prisma can't order by a
		// relation aggregate, so that sort is resolved to a page of ids up front.
		const loginSort = sort.find(([path]) => path === "last_login_at")?.[1];
		const pageIds = loginSort
			? await userIdsByLastLogin(baseWhere, loginSort, skip, take)
			: null;

		const [raw, total, absoluteTotal] = await Promise.all([
			db.user.findMany({
				select: {
					id: true,
					email: true,
					created_at: true,
					name: true,
					updated_at: true,
					username: true,
					receive_emails: true,
					receive_weekly_report: true,
					userSessions: {
						orderBy: { created_at: "desc" },
						take: 1,
						select: { created_at: true },
					},
					_count: {
						select: {
							userSessions: { where: { expires_at: { gt: new Date() } } },
						},
					},
				},
				where: pageIds ? { id: { in: pageIds } } : baseWhere,
				orderBy: pageIds ? undefined : toOrderBy(sort, { created_at: "desc" }),
				skip: pageIds ? undefined : skip,
				take: pageIds ? undefined : take,
			}),
			db.user.count({ where: baseWhere }),
			db.user.count({ where: { deleted_at: null } }),
		]);

		if (pageIds) {
			raw.sort((a, b) => pageIds.indexOf(a.id) - pageIds.indexOf(b.id));
		}

		const data = raw.map(({ userSessions, _count, ...u }) => ({
			...u,
			last_login_at: userSessions[0]?.created_at ?? null,
			active_sessions: _count.userSessions,
		}));

		return c.json({ data, total, absoluteTotal });
	});

	// Create User
	app.post("/api/users", rateLimit, auth, async (c) => {
		const json = await readJson(c);
		const name = field.string(json, "name", { required: true });
		const username = field.string(json, "username", { required: true });
		const email = field.string(json, "email", { required: true });
		const password = field.string(json, "password", {
			required: true,
			min: MIN_PASSWORD_LENGTH,
		})!;

		const hashedPassword = await Password.encrypt(password);
		const user = await db.user.create({
			data: {
				name,
				username: username!,
				email: email!,
				password: hashedPassword,
				receive_emails: field.boolean(json, "receive_emails") ?? false,
				receive_weekly_report:
					field.boolean(json, "receive_weekly_report") ?? false,
			},
			select: { id: true, email: true },
		});
		return c.json(user, 201);
	});

	// Update User
	app.patch("/api/users/:id", rateLimit, auth, async (c) => {
		const id = param(c, "id");
		const json = await readJson(c);

		// Only these fields can be changed through this endpoint.
		// An empty password means "keep the current one".
		if (json.password === "") delete json.password;
		const password = field.string(json, "password", {
			min: MIN_PASSWORD_LENGTH,
		});
		const data = defined({
			name: field.string(json, "name", { nullable: true }),
			username: field.string(json, "username", { min: 1 }) ?? undefined,
			email: field.string(json, "email", { min: 1 }) ?? undefined,
			password: password ? await Password.encrypt(password) : undefined,
			receive_emails: field.boolean(json, "receive_emails"),
			receive_weekly_report: field.boolean(json, "receive_weekly_report"),
		});

		const user = await db.user.update({
			where: { id, deleted_at: null },
			data,
			select: { id: true, email: true },
		});
		return c.json(user);
	});

	// Logout (delete current session)
	app.post("/api/users/me/logout", rateLimit, auth, async (c) => {
		const token = c.get("token");
		await db.userSession.deleteMany({ where: { token } });
		return c.json({ message: "Logged out" });
	});

	// List own sessions
	app.get("/api/users/me/sessions", rateLimit, auth, async (c) => {
		const user = c.get("user");
		const currentToken = c.get("token");

		const sessions = await db.userSession.findMany({
			where: { user_id: user.id },
			orderBy: { created_at: "desc" },
			select: {
				id: true,
				info: true,
				created_at: true,
				expires_at: true,
				token: true,
			},
		});

		return c.json(
			sessions.map((s) => ({
				id: s.id,
				info: s.info,
				created_at: s.created_at,
				expires_at: s.expires_at,
				is_current: s.token === currentToken,
			})),
		);
	});

	// Revoke a session
	app.delete("/api/users/me/sessions/:id", rateLimit, auth, async (c) => {
		const user = c.get("user");
		const currentToken = c.get("token");
		const sessionId = param(c, "id");

		const session = await db.userSession.findUnique({
			where: { id: sessionId },
		});

		if (!session || session.user_id !== user.id) {
			return c.json({ error: "Session not found" }, 404);
		}
		if (session.token === currentToken) {
			return c.json({ error: "Cannot revoke your current session" }, 400);
		}

		await db.userSession.delete({ where: { id: sessionId } });
		return c.json({ message: "Session revoked" });
	});

	// Delete User
	app.delete("/api/users/:id", rateLimit, auth, async (c) => {
		if (c.get("user").id === param(c, "id")) {
			return c.json({ error: "You cannot delete your own account" }, 400);
		}

		const targetId = param(c, "id");
		await db.$transaction([
			db.user.update({
				where: { id: targetId, deleted_at: null },
				data: { deleted_at: new Date() },
			}),
			db.userSession.deleteMany({ where: { user_id: targetId } }),
		]);

		return c.json({ message: "User deleted" });
	});
}
