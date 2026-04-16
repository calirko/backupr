import * as bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const prisma =   new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

async function main() {
  console.log("🌱 Starting seed...");

  // Hash the password
  const hashedPassword = await bcrypt.hash("123456", 10);

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: "admin@backupr.local" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@backupr.local",
      password: hashedPassword,
    },
  });
  console.log("✅ Created admin user:", admin.email);

  // Create test agent
  const agent = await prisma.agent.create({
    data: {
      name: "Test Agent",
      info: { ip: "127.0.0.1", os: "Linux", version: "1.0.0" },
      created_by_id: admin.id,
    },
  });
  console.log("✅ Created test agent:", agent.name);

  // Create backup policy
  const policy = await prisma.backupPolicy.create({
    data: {
      keep_last_n_backups: 10,
      max_backup_age_in_days: 30,
      created_by_id: admin.id,
    },
  });
  console.log("✅ Created backup policy");

  // Create backup job
  const backupJob = await prisma.backupJob.create({
    data: {
      cron: "0 2 * * *",
      files: ["/home/user/documents", "/home/user/photos"],
      use_password: false,
      compression_level: 9,
      agent_id: agent.id,
      created_by_id: admin.id,
      backupJobPolicies: {
        create: {
          backup_policy_id: policy.id,
        },
      },
    },
  });
  console.log("✅ Created backup job");

  console.log("✨ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
