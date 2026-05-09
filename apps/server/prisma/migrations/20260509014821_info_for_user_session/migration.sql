-- AlterTable
ALTER TABLE "user_sessions" ADD COLUMN     "info" JSONB NOT NULL DEFAULT '{}';
