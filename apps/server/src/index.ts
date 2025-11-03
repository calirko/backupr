import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { PrismaClient } from '@prisma/client';

const app = new Hono();
const prisma = new PrismaClient();

// Enable CORS
app.use('/*', cors());

// Health check endpoint
app.get('/', (c) => {
  return c.json({ 
    status: 'ok', 
    message: 'Backupr Server is running',
    version: '1.0.0'
  });
});

// API key validation middleware
const validateApiKey = async (c, next) => {
  const apiKey = c.req.header('X-API-Key');
  
  if (!apiKey) {
    return c.json({ error: 'API key required' }, 401);
  }
  
  // Validate API key against database
  const user = await prisma.user.findUnique({
    where: { apiKey }
  });
  
  if (!user) {
    return c.json({ error: 'Invalid API key' }, 401);
  }
  
  // Attach user to context
  c.set('user', user);
  await next();
};

// Backup endpoints
app.post('/api/backup', validateApiKey, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const { files, metadata } = body;
    
    // Create backup record
    const backup = await prisma.backup.create({
      data: {
        userId: user.id,
        status: 'in_progress',
        filesCount: files?.length || 0,
        metadata: metadata || {}
      }
    });
    
    // Create file records
    if (files && files.length > 0) {
      const fileRecords = files.map(file => ({
        backupId: backup.id,
        filePath: file.path || file,
        fileSize: file.size || 0,
        checksum: file.checksum || null,
        status: 'uploaded'
      }));
      
      await prisma.backupFile.createMany({
        data: fileRecords
      });
      
      // Calculate total size
      const totalSize = fileRecords.reduce((sum, f) => sum + f.fileSize, 0);
      
      // Update backup status
      await prisma.backup.update({
        where: { id: backup.id },
        data: {
          status: 'completed',
          totalSize
        }
      });
    } else {
      await prisma.backup.update({
        where: { id: backup.id },
        data: { status: 'completed' }
      });
    }
    
    // Log the sync
    await prisma.syncLog.create({
      data: {
        userId: user.id,
        action: 'backup',
        status: 'success',
        message: `Backed up ${files?.length || 0} files`,
        metadata: { backupId: backup.id }
      }
    });
    
    return c.json({ 
      success: true, 
      message: 'Backup completed',
      backupId: backup.id,
      timestamp: backup.timestamp,
      filesCount: files?.length || 0
    });
  } catch (error) {
    console.error('Backup error:', error);
    
    // Log failed sync
    const user = c.get('user');
    if (user) {
      await prisma.syncLog.create({
        data: {
          userId: user.id,
          action: 'backup',
          status: 'failed',
          message: error.message
        }
      });
    }
    
    return c.json({ error: 'Backup failed', details: error.message }, 500);
  }
});

app.get('/api/backup/history', validateApiKey, async (c) => {
  try {
    const user = c.get('user');
    const limit = parseInt(c.req.query('limit') || '50');
    
    const backups = await prisma.backup.findMany({
      where: {
        userId: user.id
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: limit,
      include: {
        _count: {
          select: { files: true }
        }
      }
    });
    
    return c.json({
      backups: backups.map(b => ({
        id: b.id,
        timestamp: b.timestamp,
        status: b.status,
        filesCount: b._count.files,
        totalSize: b.totalSize,
        metadata: b.metadata
      }))
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch history', details: error.message }, 500);
  }
});

app.get('/api/backup/:id', validateApiKey, async (c) => {
  try {
    const user = c.get('user');
    const id = c.req.param('id');
    
    const backup = await prisma.backup.findFirst({
      where: {
        id,
        userId: user.id
      },
      include: {
        files: true
      }
    });
    
    if (!backup) {
      return c.json({ error: 'Backup not found' }, 404);
    }
    
    return c.json({
      id: backup.id,
      timestamp: backup.timestamp,
      status: backup.status,
      filesCount: backup.filesCount,
      totalSize: backup.totalSize,
      metadata: backup.metadata,
      files: backup.files.map(f => ({
        id: f.id,
        path: f.filePath,
        size: f.fileSize,
        checksum: f.checksum,
        status: f.status,
        uploadedAt: f.uploadedAt
      }))
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch backup', details: error.message }, 500);
  }
});

// File restore endpoint
app.post('/api/restore', validateApiKey, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const { backupId, files } = body;
    
    // Verify backup exists and belongs to user
    const backup = await prisma.backup.findFirst({
      where: {
        id: backupId,
        userId: user.id
      }
    });
    
    if (!backup) {
      return c.json({ error: 'Backup not found' }, 404);
    }
    
    // Log the restore
    await prisma.syncLog.create({
      data: {
        userId: user.id,
        action: 'restore',
        status: 'success',
        message: `Restored ${files?.length || 0} files from backup ${backupId}`,
        metadata: { backupId, files }
      }
    });
    
    return c.json({ 
      success: true, 
      message: 'Restore initiated',
      backupId,
      filesCount: files?.length || 0
    });
  } catch (error) {
    console.error('Restore error:', error);
    
    // Log failed restore
    const user = c.get('user');
    if (user) {
      await prisma.syncLog.create({
        data: {
          userId: user.id,
          action: 'restore',
          status: 'failed',
          message: error.message
        }
      });
    }
    
    return c.json({ error: 'Restore failed', details: error.message }, 500);
  }
});

// Sync logs endpoint
app.get('/api/logs', validateApiKey, async (c) => {
  try {
    const user = c.get('user');
    const limit = parseInt(c.req.query('limit') || '100');
    
    const logs = await prisma.syncLog.findMany({
      where: {
        userId: user.id
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: limit
    });
    
    return c.json({ logs });
  } catch (error) {
    return c.json({ error: 'Failed to fetch logs', details: error.message }, 500);
  }
});

// User management (for development/setup)
app.post('/api/users', async (c) => {
  try {
    const body = await c.req.json();
    const { name, email, apiKey } = body;
    
    if (!apiKey) {
      return c.json({ error: 'API key is required' }, 400);
    }
    
    const user = await prisma.user.create({
      data: {
        name,
        email,
        apiKey
      }
    });
    
    return c.json({ 
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        apiKey: user.apiKey
      }
    });
  } catch (error) {
    return c.json({ error: 'Failed to create user', details: error.message }, 500);
  }
});

const port = process.env.PORT || 3000;

console.log(`🚀 Backupr Server starting on port ${port}...`);

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default {
  port,
  fetch: app.fetch,
};
