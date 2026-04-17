import { decode, sign, verify } from "hono/jwt";

export interface TokenPayload {
	user: {
		id: string;
		name: string;
		email: string;
	};
	exp: number;
	iat: number;
	nbf: number;
	iss: string;
	[key: string]: unknown;
}

export class Token {
	private static readonly SECRET_KEY =
		process.env.JWT_SECRET || "your-secret-key-change-in-production";
	private static readonly EXPIRATION_HOURS = Number(
		process.env.JWT_EXPIRATION || "24",
	);

	static secondsToDate(seconds: number): Date {
		return new Date(seconds * 1000);
	}

	static nowInSeconds(): number {
		return Math.floor(Date.now() / 1000);
	}

	static expiresAtSeconds(): number {
		return this.nowInSeconds() + this.EXPIRATION_HOURS * 60 * 60;
	}

	static async generate(payload: TokenPayload): Promise<string> {
		if (!payload || typeof payload !== "object") {
			throw new Error("Payload must be a non-empty object");
		}
		if (
			!this.SECRET_KEY ||
			this.SECRET_KEY === "your-secret-key-change-in-production"
		) {
			console.warn(
				"JWT_SECRET is not set or using default value. Please set JWT_SECRET environment variable in production.",
			);
		}
		try {
			return await sign(payload, this.SECRET_KEY, "HS256");
		} catch (error) {
			throw new Error(
				`Failed to generate token: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	static async verify(token: string): Promise<TokenPayload> {
		if (!token || typeof token !== "string") {
			throw new Error("Token must be a non-empty string");
		}
		if (!this.SECRET_KEY) {
			throw new Error("JWT_SECRET is not configured");
		}
		try {
			return (await verify(token, this.SECRET_KEY, "HS256")) as TokenPayload;
		} catch (error) {
			throw new Error(
				`Failed to verify token: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	static async isValid(token: string): Promise<boolean> {
		try {
			await this.verify(token);
			return true;
		} catch {
			return false;
		}
	}

	static decode(token: string): TokenPayload | null {
		try {
			const { payload } = decode(token);
			return payload as TokenPayload;
		} catch {
			return null;
		}
	}
}
