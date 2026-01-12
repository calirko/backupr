-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "filesCount" INTEGER NOT NULL DEFAULT 0,
    "totalSize" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupFile" (
    "id" TEXT NOT NULL,
    "backupId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" TEXT,
    "status" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Backup_userId_timestamp_idx" ON "Backup"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "BackupFile_backupId_idx" ON "BackupFile"("backupId");

-- CreateIndex
CREATE INDEX "SyncLog_userId_timestamp_idx" ON "SyncLog"("userId", "timestamp");

-- AddForeignKey
ALTER TABLE "Backup" ADD CONSTRAINT "Backup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupFile" ADD CONSTRAINT "BackupFile_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "Backup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
