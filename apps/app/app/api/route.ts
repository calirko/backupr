import { NextResponse } from "next/server";

export async function GET() {
	return NextResponse.json({
		status: "ok",
		message: "Backupr Server is running",
		version: "2.0.0",
	});
}
