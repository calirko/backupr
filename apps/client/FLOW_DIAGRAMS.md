# Backup Scheduling System - Visual Flow Diagrams

## 1. Normal Scheduled Backup Flow

```
┌─────────────────┐
│   Scheduler     │ 
│   Timer Fires   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ Calculate Next Backup Time  │
│ (calculateNextBackup)        │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Is Backup Overdue?          │
└────┬────────────────────┬───┘
     │ Yes (< 1 min)      │ No
     │                    │
     ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│ Execute         │  │ Schedule for    │
│ Immediately     │  │ Calculated Time │
└────────┬────────┘  └─────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ executeScheduledBackup()    │
│ - Check settings            │
│ - Create task via manager   │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ BackupTaskManager           │
│ - Check for duplicates      │
│ - Create BackupTask         │
│ - Queue or Execute          │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ BackupTask.execute()        │
│ - Call performBackupInternal│
│ - Track progress            │
│ - Handle errors             │
└────────┬────────────────────┘
         │
    ┌────┴─────┐
    │          │
    ▼          ▼
┌─────────┐  ┌─────────┐
│ Success │  │ Failure │
└────┬────┘  └────┬────┘
     │            │
     ▼            ▼
┌─────────┐  ┌──────────────┐
│ Update  │  │ Retry Logic  │
│ Item    │  │ (max 3 times)│
│ State   │  └──────┬───────┘
└────┬────┘         │
     │              ▼
     │         ┌──────────────┐
     │         │ Still Failed?│
     │         └──────┬───────┘
     │                │
     └────────┬───────┘
              │
              ▼
┌─────────────────────────────┐
│ scheduleNextBackup()        │
│ - Calculate next time       │
│ - Update store              │
│ - Schedule new timer        │
└─────────────────────────────┘
```

## 2. Multiple Concurrent Backups Flow

```
User Triggers 5 Backups Simultaneously
         │
         ▼
┌─────────────────────────────────────┐
│     BackupTaskManager               │
│  maxConcurrentTasks = 3             │
└─────────┬───────────────────────────┘
          │
          ▼
    ┌─────┴──────────────────────┐
    │                            │
    ▼                            ▼
┌──────────┐              ┌──────────────┐
│ Execute  │              │ Queue        │
│ Tasks    │              │ Overflow     │
│ 1, 2, 3  │              │ Tasks 4, 5   │
└────┬─────┘              └──────┬───────┘
     │                           │
     │ (Task 1 completes)        │
     │◄──────────────────────────┘
     │
     ▼
┌──────────┐
│ Execute  │
│ Task 4   │
└────┬─────┘
     │
     │ (Task 2 completes)
     │
     ▼
┌──────────┐
│ Execute  │
│ Task 5   │
└──────────┘
```

## 3. Error Retry Flow

```
┌─────────────────────────────┐
│ BackupTask.execute()        │
│ - Start backup              │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Error Occurs                │
│ (e.g., network timeout)     │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Detect Error Type           │
└────┬────────────────────┬───┘
     │ Network Error      │ Other Error
     │                    │
     ▼                    ▼
┌─────────────┐      ┌─────────────┐
│ Delay: 60s  │      │ Delay: 30s  │
│ 120s, 300s  │      │ 60s, 120s   │
└─────┬───────┘      └─────┬───────┘
      │                     │
      └──────────┬──────────┘
                 │
                 ▼
┌─────────────────────────────┐
│ retryCount < maxRetries?    │
└────┬────────────────────┬───┘
     │ Yes                │ No
     │                    │
     ▼                    ▼
┌─────────────┐      ┌──────────┐
│ Wait delay  │      │ Mark as  │
│ then retry  │      │ Failed   │
└─────┬───────┘      └────┬─────┘
      │                   │
      └────────┬──────────┘
               │
               ▼
┌─────────────────────────────┐
│ Emit retry/failed event     │
│ Update UI                   │
└─────────────────────────────┘
```

## 4. Overdue Backup Detection (App Startup)

```
┌─────────────────────────────┐
│ App Starts                  │
│ initializeScheduler()       │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Load all sync items         │
│ from store                  │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ For each enabled item:      │
│ - Check nextBackup time     │
│ - Calculate time difference │
└────────┬────────────────────┘
         │
    ┌────┴────────────────┐
    │                     │
    ▼                     ▼
┌──────────┐        ┌──────────┐
│ Overdue  │        │ Not      │
│ (>1 min) │        │ Overdue  │
└────┬─────┘        └────┬─────┘
     │                   │
     ▼                   ▼
┌──────────┐        ┌──────────┐
│ Add to   │        │ Schedule │
│ Overdue  │        │ Normally │
│ List     │        └──────────┘
└────┬─────┘
     │
     ▼
┌─────────────────────────────┐
│ Execute all overdue backups │
│ immediately (non-blocking)  │
└─────────────────────────────┘
```

## 5. Global Pause/Resume Flow

```
User Clicks "Pause All"
         │
         ▼
┌─────────────────────────────┐
│ UI sends pause-all-backups  │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ BackupTaskManager           │
│ .pauseAll()                 │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Set globallyPaused = true   │
└────────┬────────────────────┘
         │
    ┌────┴────────────────┐
    │                     │
    ▼                     ▼
┌──────────────┐    ┌──────────────┐
│ Pause all    │    │ Stop queue   │
│ running      │    │ processing   │
│ tasks        │    └──────────────┘
└──────┬───────┘
       │
       ▼
┌─────────────────────────────┐
│ Each task.pause()           │
│ - Set isPaused = true       │
│ - Call backup-manager pause │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Tasks wait in paused state  │
│ Checking every 1s for resume│
└─────────────────────────────┘

User Clicks "Resume All"
         │
         ▼
┌─────────────────────────────┐
│ BackupTaskManager           │
│ .resumeAll()                │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Set globallyPaused = false  │
└────────┬────────────────────┘
         │
    ┌────┴────────────────┐
    │                     │
    ▼                     ▼
┌──────────────┐    ┌──────────────┐
│ Resume all   │    │ Resume queue │
│ paused       │    │ processing   │
│ tasks        │    └──────────────┘
└──────┬───────┘
       │
       ▼
┌─────────────────────────────┐
│ Backups continue from where │
│ they left off               │
└─────────────────────────────┘
```

## 6. UI Update Flow

```
Backup Task State Changes
         │
         ▼
┌─────────────────────────────┐
│ BackupTask emits event      │
│ - statusChange              │
│ - progress update           │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ BackupTaskManager           │
│ - Receives event            │
│ - Re-emits to IPC           │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ IPC: task-status-update     │
│ payload: task state         │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Renderer Process            │
│ - onTaskStatusUpdate        │
└────────┬────────────────────┘
         │
    ┌────┴────────────────┐
    │                     │
    ▼                     ▼
┌──────────────┐    ┌──────────────┐
│ ActiveTasks  │    │ Upload       │
│ Panel        │    │ Progress     │
│ - Updates    │    │ - Updates    │
│   status     │    │   progress   │
└──────────────┘    └──────────────┘
```

## 7. Duplicate Prevention Flow

```
User Clicks "Backup Now" for Item A
         │
         ▼
┌─────────────────────────────┐
│ BackupTaskManager           │
│ .createTask(itemA, ...)     │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Check itemTasks map         │
│ for existing tasks for      │
│ Item A                      │
└────────┬────────────────────┘
         │
    ┌────┴────────────────┐
    │                     │
    ▼                     ▼
┌──────────────┐    ┌──────────────┐
│ Has running  │    │ No running   │
│ or pending   │    │ tasks        │
│ task?        │    └──────┬───────┘
└──────┬───────┘           │
       │                   ▼
       │            ┌──────────────┐
       │            │ Create new   │
       │            │ BackupTask   │
       │            └──────┬───────┘
       │                   │
       │                   ▼
       │            ┌──────────────┐
       │            │ Add to queue │
       │            │ or execute   │
       │            └──────────────┘
       │
       ▼
┌──────────────┐
│ Return null  │
│ (skipped)    │
└──────────────┘
```

## Legend

```
┌─────────────┐
│   Process   │  = Processing step
└─────────────┘

      │
      ▼           = Flow direction

  ┌───┴───┐
  │       │       = Decision/branch
  ▼       ▼

┌──────────┐
│ Action   │     = Action/operation
└──────────┘

      ◄           = Feedback/return flow
```

## Component Interaction Map

```
┌───────────────────────────────────────────────────────────┐
│                      UI Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │   Backup     │  │ ActiveTasks  │  │ UploadProgress │ │
│  │  Component   │  │    Panel     │  │                │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────┘ │
│         │                 │                     │         │
└─────────┼─────────────────┼─────────────────────┼─────────┘
          │                 │                     │
          │         IPC     │                     │
          ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────┐
│                    IPC Handlers                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ perform-backup, pause-all-backups, cancel-task   │  │
│  └──────────────────────────────────────────────────┘  │
└─────────┬────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│                  Main Process                            │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │Scheduler │◄─┤ TaskManager  │◄─┤  BackupTask      │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬─────────┘  │
│       │               │                    │             │
│       │               │                    ▼             │
│       │               │           ┌──────────────────┐  │
│       │               │           │ BackupManager    │  │
│       │               │           └──────────────────┘  │
│       ▼               ▼                                  │
│  ┌────────────────────────────┐                         │
│  │    Electron Store          │                         │
│  │  (syncItems, settings)     │                         │
│  └────────────────────────────┘                         │
└─────────────────────────────────────────────────────────┘
```
