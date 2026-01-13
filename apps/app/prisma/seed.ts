import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
	console.log("🌱 Starting database seed...");

	try {
		// Check if admin user already exists
		const existingAdmin = await prisma.user.findUnique({
			where: { email: "admin@backupr.local" },
		});

		if (existingAdmin) {
			console.log("✅ Admin user already exists, skipping creation");
			return;
		}

		// Hash the admin password
		const hashedPassword = await bcrypt.hash("123456", 10);

		// Generate unique API key for admin
		const apiKey = `usr_${crypto.randomUUID()}`;

		// Create admin user
		const adminUser = await prisma.user.create({
			data: {
				name: "Admin",
				email: "admin@backupr.local",
				password: hashedPassword,
				apiKey,
			},
		});

		console.log("✅ Admin user created successfully");
		console.log(`   Email: ${adminUser.email}`);
		console.log(`   API Key: ${adminUser.apiKey}`);
		console.log(`   Password: 123456`);
	} catch (error) {
		console.error("❌ Error seeding database:", error);
		throw error;
	}
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
