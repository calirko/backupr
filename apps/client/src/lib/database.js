import { PrismaClient } from '@prisma/client';
import path from 'path';
import { app } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let prisma = null;

export async function initDatabase() {
  try {
    if (!prisma) {
      // Get user data directory for storing the database
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'backupr.db');
      
      // Set the database URL for SQLite
      process.env.DATABASE_URL = `file:${dbPath}`;
      
      prisma = new PrismaClient();
      
      // For SQLite with Electron, we use db push to create/update schema
      // This ensures the database is created without needing migration files
      try {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "SyncHistory" (
            "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "filePath" TEXT NOT NULL,
            "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "status" TEXT NOT NULL,
            "message" TEXT,
            "fileSize" INTEGER,
            "checksum" TEXT
          )
        `);
        
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "Setting" (
            "key" TEXT NOT NULL PRIMARY KEY,
            "value" TEXT NOT NULL,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "BackupConfig" (
            "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "filePath" TEXT NOT NULL,
            "enabled" BOOLEAN NOT NULL DEFAULT true,
            "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } catch (error) {
        // Tables might already exist, which is fine
        console.log('Database tables initialized');
      }
      
      // Test connection
      await prisma.$connect();
      
      console.log('Database initialized at:', dbPath);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Database initialization error:', error);
    return { success: false, error: error.message };
  }
}

export async function addSyncHistory(filePath, status, message = '', fileSize = null, checksum = null) {
  if (!prisma) {
    throw new Error('Database not initialized');
  }
  
  return await prisma.syncHistory.create({
    data: {
      filePath,
      status,
      message,
      fileSize,
      checksum
    }
  });
}

export async function getSyncHistory(limit = 50) {
  if (!prisma) {
    return [];
  }
  
  return await prisma.syncHistory.findMany({
    orderBy: {
      syncedAt: 'desc'
    },
    take: limit
  });
}

export async function saveSetting(key, value) {
  if (!prisma) {
    throw new Error('Database not initialized');
  }
  
  return await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
}

export async function getSetting(key) {
  if (!prisma) {
    return null;
  }
  
  const setting = await prisma.setting.findUnique({
    where: { key }
  });
  
  return setting?.value || null;
}

export async function getBackupFiles() {
  if (!prisma) {
    return [];
  }
  
  return await prisma.backupConfig.findMany({
    where: {
      enabled: true
    },
    orderBy: {
      addedAt: 'desc'
    }
  });
}

export async function addBackupFile(filePath) {
  if (!prisma) {
    throw new Error('Database not initialized');
  }
  
  return await prisma.backupConfig.create({
    data: {
      filePath,
      enabled: true
    }
  });
}

export async function removeBackupFile(id) {
  if (!prisma) {
    throw new Error('Database not initialized');
  }
  
  return await prisma.backupConfig.delete({
    where: { id }
  });
}

export async function closeDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

export { prisma };

