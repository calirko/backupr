-- AlterTable
ALTER TABLE "users" ADD COLUMN     "receive_weekly_report" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weekly_report_sent_at" TIMESTAMP(3);
