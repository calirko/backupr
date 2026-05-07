/*
  Warnings:

  - You are about to drop the column `info` on the `agents` table. All the data in the column will be lost.
  - You are about to drop the column `last_seen` on the `agents` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "agent_sessions" ADD COLUMN     "info" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "agents" DROP COLUMN "info",
DROP COLUMN "last_seen";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "name" DROP NOT NULL;
