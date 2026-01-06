# Backup Scheduling System Documentation

## Overview

The backup scheduling system has been completely refactored to handle concurrent backups, retry logic, error recovery, and provide real-time UI updates. The new system is built around a task-based architecture with clean separation of concerns.

## Architecture

### Core Components

#### 1. BackupTask (`electron/lib/backup-task.js`)
Represents a single backup operation with complete state tracking.

**Features:**
- State management (pending, running, paused, completed, failed, cancelled)
- Automatic retry with exponential backoff
- Network error detection with longer retry delays
- Progress tracking
- Event-driven architecture

**Key Methods:**
- `execute()` - Executes the backup task
- `pause()` - Pauses the task
- `resume()` - Resumes the task
- `cancel()` - Cancels the task
- `getState()` - Returns current task state

**Events Emitted:**
- `statusChange` - Task status changed
- `completed` - Task completed successfully
- `failed` - Task failed after all retries
- `retry` - Task is retrying
- `paused` - Task was paused
- `resumed` - Task was resumed
- `cancelled` - Task was cancelled

#### 2. BackupTaskManager (`electron/lib/backup-task-manager.js`)
Manages multiple concurrent backup tasks with queue management.

**Features:**
- Concurrent task execution (configurable, default: 3)
- Task queue for overflow
- Duplicate task prevention
- Global pause/resume
- Task lifecycle management
- Automatic cleanup

**Key Methods:**
- `createTask(item, settings, store, mainWindow)` - Creates and enqueues a task
- `pauseAll()` - Pauses all tasks globally
- `resumeAll()` - Resumes all tasks
- `cancelTask(taskId)` - Cancels a specific task
- `getActiveTasks()` - Returns all active tasks
- `getStats()` - Returns manager statistics
- `shutdown()` - Shuts down and cancels all tasks

**Events Emitted:**
- `taskCreated` - New task created
- `taskQueued` - Task added to queue
- `taskStatusChange` - Any task status changed
- `taskCompleted` - Task completed
- `taskFailed` - Task failed
- `taskCancelled` - Task cancelled
- `taskRetry` - Task is retrying
- `globalPause` - Global pause state changed

#### 3. Enhanced Scheduler (`electron/scheduler.js`)
Improved scheduler using the task manager for execution.

**Features:**
- Overdue backup detection on startup
- Integration with task manager
- Safe timeout handling (max 20 days)
- Automatic rescheduling after completion/failure

**Key Functions:**
- `initializeScheduler(store, mainWindow)` - Initializes scheduler and handles overdue backups
- `scheduleBackup(item)` - Schedules a backup item
- `executeScheduledBackup(item, store, mainWindow)` - Executes using task manager
- `getTaskManager()` - Returns task manager instance

## Edge Case Handling

### 1. Simultaneous Backups
**Scenario:** Two different backups scheduled at the same time

**Solution:**
- Task manager allows up to 3 concurrent backups
- Overflow backups are queued automatically
- Each backup runs in its own task with independent state

**Implementation:**
```javascript
// Task manager handles concurrency
if (runningTasks.size < maxConcurrentTasks) {
    executeTask(task);
} else {
    taskQueue.push(task.id);
}
```

### 2. Same Item Backup Conflict
**Scenario:** Same backup item triggered while already running

**Solution:**
- Duplicate detection prevents multiple tasks for same item
- Check if item already has running/pending task

**Implementation:**
```javascript
const hasRunningTask = Array.from(existingTasks).some(taskId => {
    const task = tasks.get(taskId);
    return task && (task.status === "running" || task.status === "pending");
});

if (hasRunningTask) {
    return null; // Skip creation
}
```

### 3. Error Handling with Retry
**Scenario:** Backup fails due to network or server error

**Solution:**
- Automatic retry with exponential backoff (30s, 60s, 120s)
- Network errors get longer delays (60s, 120s, 300s)
- Maximum 3 retry attempts
- After all retries fail, task is marked as failed and next backup is scheduled

**Implementation:**
```javascript
const isNetworkError = /* check error codes */;
const baseDelay = isNetworkError ? 60000 : 30000;
const delay = Math.min(
    baseDelay * Math.pow(2, retryCount - 1),
    isNetworkError ? 300000 : 120000
);
```

### 4. Overdue Backups on Startup
**Scenario:** App was closed with scheduled backups that are now overdue

**Solution:**
- On initialization, scheduler checks all items for overdue backups
- Overdue backups (>1 minute late) are executed immediately
- One attempt per overdue backup
- Normal scheduling continues regardless

**Implementation:**
```javascript
if (item.nextBackup) {
    const nextBackupTime = new Date(item.nextBackup);
    const timeDiff = nextBackupTime.getTime() - now.getTime();
    
    if (timeDiff < -60000) {
        overdueItems.push(item);
    }
}
```

### 5. Global Pause
**Scenario:** User pauses all backups

**Solution:**
- Global pause flag prevents new task execution
- Running tasks are paused individually
- Queue processing stops
- Resume restarts all paused tasks and queue processing

### 6. App Shutdown During Backup
**Scenario:** User closes app while backup is running

**Solution:**
- `clearAllScheduledBackups()` called in `before-quit` event
- Task manager `shutdown()` cancels all active tasks
- Cleanup ensures no zombie processes

## UI Updates

### Real-time Progress Tracking

**Stages:**
1. **Compressing** - Shows compression percentage
2. **Uploading** - Shows upload progress
3. **Preparing** - Firebird-specific preparation

**Progress Updates:**
```javascript
mainWindow.webContents.send("backup-progress", {
    message: "Compressing: 45/100 files (45%)",
    percent: 35,
    stage: "compressing",
    paused: false
});
```

### Active Tasks Panel
Shows all active backup tasks with:
- Real-time status (running, queued, paused, completed, failed)
- Progress bars for running tasks
- Retry indicators
- Cancel buttons
- Queue statistics

### Status Indicators
- **Running** - Blue spinner icon
- **Queued** - Gray clock icon
- **Paused** - Orange pause icon
- **Completed** - Green check icon
- **Failed** - Red alert icon
- **Retrying** - Orange refresh icon with pulse animation

## Configuration

### Task Manager Settings
```javascript
maxConcurrentTasks: 3  // Maximum concurrent backups
```

### Retry Settings (per task)
```javascript
maxRetries: 3          // Maximum retry attempts
baseDelay: 30000       // Base delay: 30s
networkDelay: 60000    // Network error delay: 60s
```

### Scheduler Settings
```javascript
SAFE_TIMEOUT_DELAY: 86400000 * 20  // 20 days max timeout
```

## API Reference

### IPC Handlers

#### Backup Operations
- `perform-backup` - Execute manual backup
- `perform-firebird-backup` - Execute Firebird backup
- `pause-backup` - Pause current backup
- `resume-backup` - Resume current backup

#### Task Manager Operations
- `pause-all-backups` - Pause all backups globally
- `resume-all-backups` - Resume all backups
- `get-active-tasks` - Get list of active tasks
- `get-task-manager-stats` - Get manager statistics
- `cancel-task` - Cancel specific task

### IPC Events

#### From Main to Renderer
- `backup-progress` - Progress update with message, percent, stage
- `task-status-update` - Task state changed

#### From Renderer to Main
- All handlers listed above

## Testing

Run the included test suite:
```bash
cd apps/client
node test-task-manager.js
```

Tests cover:
- Task manager initialization
- Task creation and lifecycle
- Event system
- Duplicate detection
- Global pause/resume
- Scheduler utilities

## Migration Notes

### From Old System
The old system had:
- Single backup state (couldn't handle concurrent backups)
- No retry logic
- Basic overdue handling
- Limited progress tracking

### New System Benefits
- ✓ Multiple concurrent backups
- ✓ Automatic retry with exponential backoff
- ✓ Network error detection
- ✓ Comprehensive overdue handling
- ✓ Detailed progress with stages
- ✓ Real-time UI updates
- ✓ Task queue management
- ✓ Global pause/resume
- ✓ Duplicate prevention

## Best Practices

1. **Error Handling**: Always check task status before operations
2. **UI Updates**: Use event listeners for real-time updates
3. **Resource Cleanup**: Always call `shutdown()` on app quit
4. **Queue Management**: Monitor stats to adjust `maxConcurrentTasks` if needed
5. **Retry Logic**: Configure retry settings based on use case
6. **Testing**: Use test script to verify changes before deploying

## Troubleshooting

### Tasks Not Starting
- Check `globallyPaused` state
- Verify `maxConcurrentTasks` not exceeded
- Check for duplicate tasks

### Excessive Retries
- Increase `maxRetries` for unreliable networks
- Adjust delay timings
- Check network connectivity

### UI Not Updating
- Verify event listeners are set up
- Check IPC communication
- Ensure main window reference is valid

### Memory Issues
- Reduce `maxConcurrentTasks`
- Enable task cleanup
- Monitor task count with `getStats()`
