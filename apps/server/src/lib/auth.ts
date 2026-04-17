import type { Context, Next } from "hono";
import { prisma } from "./prisma";
import { Token, type TokenPayload } from "./token";

const db = prisma;

type Variables = {
	user: TokenPayload["user"];
	token: string;
};

export const auth = async (
	c: Context<{ Variables: Variables }>,
	next: Next,
) => {
	const authHeader = c.req.header("Authorization");

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return c.json(
			{ error: "Unauthorized: Missing or invalid token format" },
			401,
		);
	}

	const token = authHeader.replace("Bearer ", "");

	try {
		const payload = await Token.verify(token);
		const now = Token.nowInSeconds();

		if (payload.iss !== "backupr") {
			return c.json({ error: "Unauthorized: Invalid issuer" }, 401);
		}

		if (payload.nbf && payload.nbf > now) {
			return c.json({ error: "Unauthorized: Token not yet active" }, 401);
		}

		const session = await db.userSession.findUnique({
			where: { token },
			include: {
				user: {
					select: {
						id: true,
						name: true,
						email: true,
					},
				},
			},
		});

		if (!session) {
			return c.json(
				{ error: "Unauthorized: Session not found or revoked" },
				401,
			);
		}

		if (new Date(session.expires_at) < new Date()) {
			return c.json({ error: "Unauthorized: Session expired" }, 401);
		}

		if (!session.user) {
			return c.json({ error: "Unauthorized: User no longer exists" }, 401);
		}

		c.set("user", session.user);
		c.set("token", token);

		await next();
	} catch (error) {
		console.error("Auth Middleware Error:", error);
		return c.json({ error: "Unauthorized: Invalid or expired token" }, 401);
	}
};
