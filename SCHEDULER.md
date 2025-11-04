# Backup Scheduler System

The backup scheduler automatically triggers backups based on configured intervals. The system maintains consistent timing by calculating the next backup time based on the last backup execution, rather than app start time.

## Features

- **Consistent Timing**: Schedules are calculated from the last backup time, not app startup
- **Automatic Recovery**: If a backup is overdue when the app starts, it runs immediately
- **Smart Scheduling**: Each sync item has its own independent timer
- **Persistent State**: Timers are restored after app restarts based on stored sync items
- **Graceful Cleanup**: All timers are properly cleared when the app quits

## How It Works

### 1. Initialization
When the app starts (`app.whenReady()`), the scheduler:
- Loads all sync items from storage
- For each enabled item with a non-manual interval:
  - Calculates when the next backup should occur based on `lastBackup` time
  - If the calculated time is in the past (overdue), runs the backup immediately
  - Otherwise, schedules a timer for the calculated future time

### 2. Timer Calculation
The `calculateNextBackupTime()` function:
- Takes the last backup time (or current time if never backed up)
- Adds the interval duration
- Returns the next scheduled time

Example: If an item has a 24-hour interval and last backed up at `2025-11-04 10:00:00`:
- Next backup: `2025-11-05 10:00:00`
- If app starts at `2025-11-05 11:00:00`, backup runs immediately
- New next backup time: `2025-11-06 11:00:00` (24 hours from execution)

### 3. Execution
When a scheduled backup triggers:
1. Loads current server settings
2. Executes the appropriate backup (normal or Firebird)
3. Updates the `lastBackup` timestamp in storage
4. Calculates and schedules the next backup
5. Stores the updated sync item

### 4. Manual Updates
When a sync item is saved or deleted:
- **Save**: The scheduler is updated for that item
- **Delete**: The timer is cleared and removed
- **Enable/Disable**: Timers are started or stopped accordingly

## Architecture

### Core Functions

#### `calculateNextBackupTime(interval, customHours, lastBackup)`
Calculates the next backup time based on interval and last backup time.

#### `scheduleBackup(item)`
Creates a timer for a sync item. Clears any existing timer first.

#### `executeScheduledBackup(item)`
Runs the backup when the timer fires. Handles both normal and Firebird backups.

#### `scheduleNextBackup(item)`
Calculates and schedules the next occurrence after a backup completes.

#### `initializeScheduler()`
Loads all sync items and schedules enabled ones. Called on app ready.

#### `clearAllScheduledBackups()`
Clears all timers. Called before app quit.

### Internal Backup Functions

#### `performBackupInternal(params)`
Shared backup logic for both manual and scheduled backups.

#### `performFirebirdBackupInternal(params)`
Shared Firebird backup logic for both manual and scheduled backups.

### Data Flow

```
App Start
  ↓
initializeScheduler()
  ↓
Load sync items from storage
  ↓
For each enabled item:
  ↓
calculateNextBackupTime()
  ↓
Is time in past? → Yes → executeScheduledBackup() immediately
  ↓                No  → setTimeout() for future time
  ↓
Wait for timer...
  ↓
executeScheduledBackup()
  ↓
Update lastBackup timestamp
  ↓
scheduleNextBackup()
  ↓
Loop continues...
```

## Intervals

### Available Options
- **manual**: No automatic backups (timer not created)
- **hourly**: Every 60 minutes
- **daily**: Every 24 hours
- **weekly**: Every 7 days
- **custom**: User-defined hours (e.g., every 6 hours, 48 hours, etc.)

### Timing Examples

**Scenario**: Item with 12-hour interval, last backup at 08:00

| Current Time | Next Backup | Action |
|--------------|-------------|--------|
| App starts at 14:00 | 20:00 | Schedule timer for 6 hours |
| App starts at 21:00 | Overdue | Run immediately, next = 09:00 next day |
| Backup at 20:00 | 08:00 next day | Schedule timer for 12 hours |

## Error Handling

### Server Unavailable
If a scheduled backup fails (server down, no connection, etc.):
- Error is logged
- User is notified via progress event
- Backup is rescheduled based on the original interval
- No retry logic (waits for next scheduled time)

### App Crashes
If the app crashes or is force-quit:
- Timers are lost (they're in-memory)
- On next app start, `initializeScheduler()` recalculates
- Overdue backups run immediately
- System recovers to normal schedule

## Storage

Sync items are stored with these timestamp fields:
- `lastBackup`: ISO 8601 timestamp of last successful backup
- `nextBackup`: ISO 8601 timestamp of next scheduled backup (informational)

The `nextBackup` field is updated whenever:
- A sync item is saved
- A scheduled backup completes
- The scheduler is initialized

## Code Locations

### Main Process (`electron/main.js`)
- Lines ~290-520: Scheduler functions
- Lines ~640-990: Internal backup functions
- Line ~1227: Scheduler initialization in `app.whenReady()`
- Line ~1245: Cleanup in `app.on("before-quit")`

### IPC Handlers
- `save-sync-item`: Updates scheduler when item is saved
- `delete-sync-item`: Clears timer when item is deleted
- `perform-backup`: Manual backups (calls internal function)
- `perform-firebird-backup`: Manual Firebird backups (calls internal function)

## Future Enhancements

Potential improvements:
- [ ] Retry logic with exponential backoff for failed backups
- [ ] Pause/resume functionality for all backups
- [ ] Skip next scheduled backup option
- [ ] Run missed backups queue (if multiple were skipped)
- [ ] Schedule-specific notifications/sounds
- [ ] Backup queue management (prevent overlapping backups)
- [ ] Backup history tracking per sync item
- [ ] Smart scheduling (avoid during active hours, etc.)
