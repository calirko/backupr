# Database Setup

The client application uses MySQL to store sync history and settings.

## Prerequisites

- MySQL 5.7+ or MariaDB 10.2+

## Setup Instructions

1. **Install MySQL** (if not already installed)
   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install mysql-server
   
   # macOS (using Homebrew)
   brew install mysql
   
   # Windows
   # Download from https://dev.mysql.com/downloads/mysql/
   ```

2. **Create Database**
   ```sql
   CREATE DATABASE backupr;
   ```

3. **Create User** (optional, recommended for security)
   ```sql
   CREATE USER 'backupr_user'@'localhost' IDENTIFIED BY 'your_password';
   GRANT ALL PRIVILEGES ON backupr.* TO 'backupr_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

4. **Configure Client**
   
   When you first run the client application:
   - Go to the **Settings** tab
   - Under "Database Settings", enter:
     - Host: `localhost` (or your MySQL server address)
     - User: `root` (or your custom user like `backupr_user`)
     - Password: Your MySQL password
     - Database Name: `backupr`
   - Click "Save Settings"

5. **Tables Created Automatically**
   
   The client will automatically create the following tables when it first connects:
   
   - `sync_history` - Stores backup sync history
     - `id` - Auto-increment primary key
     - `file_path` - Path of the backed-up file
     - `synced_at` - Timestamp of the sync
     - `status` - Status of the sync (success, failed, etc.)
     - `message` - Optional message or error details
   
   - `settings` - Stores application settings
     - `key_name` - Setting key (primary key)
     - `value` - Setting value
     - `updated_at` - Last update timestamp

## Configuration Notes

- **Local Development**: Use default MySQL settings (host: localhost, user: root)
- **Production**: Create a dedicated user with limited privileges for security
- **Connection Issues**: Ensure MySQL is running and accepting connections
  ```bash
  # Check MySQL status
  sudo systemctl status mysql  # Linux
  brew services list            # macOS
  ```

## Troubleshooting

### Connection Refused
- Ensure MySQL server is running
- Check that the port 3306 is not blocked by firewall
- Verify the host address is correct

### Access Denied
- Double-check username and password
- Ensure the user has privileges for the database
- Try resetting the password if needed

### Database Not Found
- Create the database manually using the SQL command above
- Ensure the database name in settings matches the actual database name
