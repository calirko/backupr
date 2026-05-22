/*
  Warnings:

  - You are about to drop the `AgentStatus` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "AgentStatusEnum" ADD VALUE 'FAILED_BACKUP';

-- DropForeignKey
ALTER TABLE "AgentStatus" DROP CONSTRAINT "AgentStatus_agent_id_fkey";

-- DropTable
DROP TABLE "AgentStatus";

-- CreateTable
CREATE TABLE "agent_status" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "status" "AgentStatusEnum" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_status_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
