import type { Hono } from "hono";
import { auth } from "../lib/auth";
import { Password } from "../lib/password";
import { prisma } from "../lib/prisma";
import { authRateLimit, rateLimit } from "../lib/rate-limit";
import { Token, type TokenPayload } from "../lib/token";

const db = prisma;
const SERVER_URL = process.env.SERVER_URL || "http://localhost:5174";

export default async function userRoutes(app: Hono) {
	// List Users (Paginated)
	app.get("/api/users", rateLimit, auth, async (c) => {
		const { filters, orderBy, skip, take } = c.req.query();
		const parsedFilters = filters
			? JSON.parse(decodeURIComponent(filters))
			: {};
		const parsedOrderBy = orderBy
			? JSON.parse(decodeURIComponent(orderBy))
			: {};

		const s = skip ? parseInt(skip) : undefined;
		const t = take ? parseInt(take) : undefined;

		const baseWhere = { deleted_at: null, ...parsedFilters };

		// last_login_at is virtual (derived from userSessions); translate it to a
		// Prisma relation-aggregate orderBy so server-side sorting works correctly.
		let resolvedOrderBy: object = { created_at: "desc" };
		if (Object.keys(parsedOrderBy).length) {
			if ("last_login_at" in parsedOrderBy) {
				resolvedOrderBy = {
					userSessions: { _max: { created_at: parsedOrderBy.last_login_at } },
				};
			} else {
				resolvedOrderBy = parsedOrderBy;
			}
		}

		const [raw, total, absoluteTotal] = await Promise.all([
			db.user.findMany({
				select: {
					id: true,
					email: true,
					created_at: true,
					name: true,
					updated_at: true,
					username: true,
					userSessions: {
						orderBy: { created_at: "desc" },
						take: 1,
						select: { created_at: true },
					},
				},
				where: baseWhere,
				orderBy: resolvedOrderBy,
				skip: s,
				take: t,
			}),
			db.user.count({ where: baseWhere }),
			db.user.count({ where: { deleted_at: null } }),
		]);

		const data = raw.map(({ userSessions, ...u }) => ({
			...u,
			last_login_at: userSessions[0]?.created_at ?? null,
		}));

		return c.json({ data, total, absoluteTotal });
	});

	// Create User
	app.post("/api/users", rateLimit, auth, async (c) => {
		let json;
		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		const { name, username, email, password } = json;
		if (!email || !password || !name || !username)
			return c.json({ error: "Missing fields" }, 400);

		const hashedPassword = await Password.encrypt(password);
		const user = await db.user.create({
			data: { name, username, email, password: hashedPassword },
			select: { id: true, email: true },
		});
		return c.json(user, 201);
	});

	// Update User
	app.patch("/api/users/:id", rateLimit, auth, async (c) => {
		const id = c.req.param("id");
		let json;
		try {
			json = await c.req.json();
		} catch (e) {
			return c.json({ error: "Invalid JSON" }, 400);
		}

		if (json.password) {
			json.password = await Password.encrypt(json.password);
		}

		const user = await db.user.update({
			where: { id },
			data: json,
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
		const sessionId = c.req.param("id");

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
		const tokenPayload = await Token.verify(
			c.req.header("Authorization")?.split(" ")[1] ?? "",
		);
		const userId = tokenPayload.user.id;
		if (userId === c.req.param("id")) {
			return c.json({ error: "You cannot delete your own account" }, 400);
		}

		const targetId = c.req.param("id");
		await db.$transaction([
			db.user.update({
				where: { id: targetId },
				data: { deleted_at: new Date() },
			}),
			db.userSession.deleteMany({ where: { user_id: targetId } }),
		]);

		return c.json({ message: "User deleted" });
	});
}
