import mysql from 'mysql2/promise';

let connection = null;

export async function initDatabase(config) {
  try {
    connection = await mysql.createConnection({
      host: config.host || 'localhost',
      user: config.user || 'root',
      password: config.password || '',
      database: config.database || 'backupr'
    });

    // Create tables if they don't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS sync_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_path VARCHAR(500) NOT NULL,
        synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) NOT NULL,
        message TEXT
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key_name VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    return { success: true };
  } catch (error) {
    console.error('Database initialization error:', error);
    return { success: false, error: error.message };
  }
}

export async function addSyncHistory(filePath, status, message = '') {
  if (!connection) {
    throw new Error('Database not initialized');
  }
  
  await connection.execute(
    'INSERT INTO sync_history (file_path, status, message) VALUES (?, ?, ?)',
    [filePath, status, message]
  );
}

export async function getSyncHistory(limit = 50) {
  if (!connection) {
    return [];
  }
  
  const [rows] = await connection.execute(
    'SELECT * FROM sync_history ORDER BY synced_at DESC LIMIT ?',
    [limit]
  );
  
  return rows;
}

export async function closeDatabase() {
  if (connection) {
    await connection.end();
    connection = null;
  }
}
