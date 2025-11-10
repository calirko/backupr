-- AlterTable
ALTER TABLE "Backup" ADD COLUMN     "backupName" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "userId" DROP NOT NULL,
ALTER COLUMN "totalSize" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "SyncLog" ADD COLUMN     "clientId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "apiKey" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_apiKey_key" ON "Client"("apiKey");

-- CreateIndex
CREATE INDEX "Backup_clientId_timestamp_idx" ON "Backup"("clientId", "timestamp");

-- CreateIndex
CREATE INDEX "Backup_clientId_backupName_version_idx" ON "Backup"("clientId", "backupName", "version");

-- CreateIndex
CREATE INDEX "SyncLog_clientId_timestamp_idx" ON "SyncLog"("clientId", "timestamp");

-- AddForeignKey
ALTER TABLE "Backup" ADD CONSTRAINT "Backup_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
