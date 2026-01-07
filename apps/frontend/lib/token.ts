import { jwtVerify, SignJWT } from "jose";
import * as jwt from "jsonwebtoken";

interface TokenType {
	userId: string;
	email: string;
	name: string;
}

const encoder = new TextEncoder();

const getSecretKey = () => {
	const SECRET = process.env.SECRET_TOKEN;
	if (!SECRET) throw new Error("SECRET_TOKEN environment variable is not set.");
	return encoder.encode(SECRET);
};

export const Token = {
	async encrypt(payload: object): Promise<string> {
		return await new SignJWT(payload as Record<string, unknown>)
			.setProtectedHeader({ alg: "HS256" })
			.sign(getSecretKey());
	},

	async decrypt(token: string) {
		try {
			const { payload } = await jwtVerify(token, getSecretKey());
			return payload as object as TokenType;
		} catch (_error) {
			return null;
		}
	},

	payload(token: string) {
		const tokenPayload = jwt.decode(token);
		return tokenPayload as TokenType | null;
	},

	async validate(token: string) {
		const data = await Token.decrypt(token);
		return data !== null;
	},
};
