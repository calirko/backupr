import { type NextRequest, NextResponse } from "next/server";
import { Token } from "./lib/token";

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};

export async function proxy(request: NextRequest) {
	const token = request.cookies.get("token")?.value;
	const payload = await Token.decrypt(token || "");

	if (!payload && !request.nextUrl.pathname.startsWith("/auth/signin")) {
		return NextResponse.redirect(new URL("/auth/signin", request.url));
	}

	if (payload && request.nextUrl.pathname.startsWith("/auth/signin")) {
		return NextResponse.redirect(new URL("/home", request.url));
	}

	if (request.nextUrl.pathname === "/") {
		return NextResponse.redirect(new URL("/home", request.url));
	}

	return NextResponse.next();
}
