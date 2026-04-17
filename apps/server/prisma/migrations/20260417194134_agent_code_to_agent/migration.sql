/*
  Warnings:

  - Added the required column `agent_id` to the `agent_codes` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "agent_codes" ADD COLUMN     "agent_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "agent_codes" ADD CONSTRAINT "agent_codes_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
