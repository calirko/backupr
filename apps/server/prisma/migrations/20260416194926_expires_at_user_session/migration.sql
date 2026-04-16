/*
  Warnings:

  - You are about to drop the column `exp` on the `user_sessions` table. All the data in the column will be lost.
  - Added the required column `expires_at` to the `user_sessions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "user_sessions" DROP COLUMN "exp",
ADD COLUMN     "expires_at" TIMESTAMP(3) NOT NULL;
