import { NextRequest, NextResponse } from "next/server";
import { getPrismaClient, validateToken, errorResponse } from "@/lib/server/api-helpers";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const validation = await validateToken(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status }
			);
		}

		const prisma = getPrismaClient();
		const { id } = await params;

		const client = await prisma.client.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				email: true,
				folderPath: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		if (!client) {
			return NextResponse.json({ error: "Client not found" }, { status: 404 });
		}

		return NextResponse.json({ client });
	} catch (error) {
		return errorResponse(error, "Error fetching client");
	}
}

export async function PATCH(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const validation = await validateToken(request);
		if ("error" in validation) {
			return NextResponse.json(
				{ error: validation.error },
				{ status: validation.status }
			);
		}

		const prisma = getPrismaClient();
		const { id } = await params;
		const { name, email, folderPath } = await request.json();

		// Check if client exists
		const existingClient = await prisma.client.findUnique({
			where: { id },
		});

		if (!existingClient) {
			return NextResponse.json({ error: "Client not found" }, { status: 404 });
		}

		// Check if name is taken by another client
		if (name && name !== existingClient.name) {
			const nameTaken = await prisma.client.findUnique({
				where: { name },
			});

			if (nameTaken) {
				return NextResponse.json(
					{ error: "A client with this name already exists" },
					{ status: 400 }
				);
			}
		}

		// Prepare update data
		const updateData: any = {};
		if (name) updateData.name = name;
		if (email !== undefined) updateData.email = email;
		if (folderPath) updateData.folderPath = folderPath;

		// Update client
		const client = await prisma.client.update({
			where: { id },
			data: updateData,
			select: {
				id: true,
				name: true,
				email: true,
				folderPath: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		return NextResponse.json({ client });
	} catch (error) {
		return errorResponse(error, "Error updating client");
	}
}
