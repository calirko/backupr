import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

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
  
  // In a real application, validate against a database
  // For now, we'll accept any non-empty key
  await next();
};

// Backup endpoints
app.post('/api/backup', validateApiKey, async (c) => {
  try {
    const body = await c.req.json();
    const { files, metadata } = body;
    
    // In a real implementation, this would:
    // 1. Receive file data
    // 2. Store files in a backup location
    // 3. Record backup metadata in a database
    
    console.log('Received backup request for files:', files);
    
    return c.json({ 
      success: true, 
      message: 'Backup received',
      timestamp: new Date().toISOString(),
      filesCount: files?.length || 0
    });
  } catch (error) {
    return c.json({ error: 'Backup failed', details: error.message }, 500);
  }
});

app.get('/api/backup/history', validateApiKey, async (c) => {
  // In a real implementation, fetch from database
  return c.json({
    history: [
      {
        id: 1,
        timestamp: new Date().toISOString(),
        filesCount: 5,
        status: 'completed'
      }
    ]
  });
});

app.get('/api/backup/:id', validateApiKey, async (c) => {
  const id = c.req.param('id');
  
  return c.json({
    id,
    timestamp: new Date().toISOString(),
    status: 'completed',
    files: []
  });
});

// File restore endpoint
app.post('/api/restore', validateApiKey, async (c) => {
  try {
    const body = await c.req.json();
    const { backupId, files } = body;
    
    console.log('Received restore request for backup:', backupId);
    
    return c.json({ 
      success: true, 
      message: 'Restore initiated',
      backupId,
      filesCount: files?.length || 0
    });
  } catch (error) {
    return c.json({ error: 'Restore failed', details: error.message }, 500);
  }
});

const port = process.env.PORT || 3000;

console.log(`🚀 Backupr Server starting on port ${port}...`);

export default {
  port,
  fetch: app.fetch,
};
