-- CreateEnum
CREATE TYPE "AgentStatusEnum" AS ENUM ('ONLINE', 'OFFLINE', 'RUNNING_BACKUP');

-- CreateTable
CREATE TABLE "AgentStatus" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "status" "AgentStatusEnum" NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "is_single_point_in_time" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AgentStatus_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AgentStatus" ADD CONSTRAINT "AgentStatus_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
