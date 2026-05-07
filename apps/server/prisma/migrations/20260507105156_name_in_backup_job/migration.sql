/*
  Warnings:

  - Added the required column `name` to the `backup_jobs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "backup_jobs" ADD COLUMN     "name" TEXT NOT NULL;
