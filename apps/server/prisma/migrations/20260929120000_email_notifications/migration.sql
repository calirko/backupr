-- AlterTable
ALTER TABLE "backup_jobs" ADD COLUMN     "failure_notified_at" TIMESTAMP(3),
ADD COLUMN     "stale_notified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "receive_emails" BOOLEAN NOT NULL DEFAULT false;
