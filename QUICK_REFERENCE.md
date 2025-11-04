# Quick Reference - Improved Client Features

## Tray Icon Features

### Right-Click Menu
- **Show Backupr** - Opens the application window
- **Hide Backupr** - Minimizes to system tray
- **Backup Now** - Triggers backup of all enabled sync items
- **Quit Backupr** - Completely exits the application

### Click Behavior
- **Single Click** - Show and focus the window
- **Double Click** - Toggle window visibility (show/hide)

## Sync Item Configuration

### Interval Options
1. **Manual Only** - No automatic backups, manual trigger only
2. **Every Hour** - Backs up every 60 minutes
3. **Daily** - Backs up once per day (24 hours)
4. **Weekly** - Backs up once per week (168 hours)
5. **Custom Interval** - Set any number of hours (1-168)

### Custom Interval Examples
- `6` hours - Backup 4 times per day
- `12` hours - Backup twice per day (noon and midnight)
- `8` hours - Backup 3 times per day
- `48` hours - Backup every 2 days
- `72` hours - Backup every 3 days

## Grid View Interface

### Sync Item Card Shows
- ✅ Sync item name with enabled status indicator
- 🕐 Configured interval (e.g., "Every 12 hours")
- 📁 First 2 paths, then "+X more" if additional paths exist
- 📅 Last backup timestamp
- ⏰ Next backup countdown (e.g., "in 5h 20m")
- 🔵 Individual "Backup Now" button

### Actions
- **Edit** (✏️ icon) - Modify sync item configuration
- **Delete** (🗑️ icon) - Remove sync item permanently
- **Backup Now** - Start immediate backup of this item
- **Backup All** - Start backup of all enabled items

## Large File Handling

### Automatic Detection
- Files **under 10MB** - Loaded into memory and uploaded
- Files **over 10MB** - Streamed directly to server

### Progress Tracking
Real-time updates show:
- Current file being processed
- Overall percentage complete
- Files processed / Total files
- Estimated time remaining

### Benefits
- ✅ No memory crashes on large backups
- ✅ Can backup gigabytes of data
- ✅ Visual feedback during long uploads
- ✅ Handles entire directories efficiently

## Adding a New Sync Item

### Step-by-Step
1. Click **"+ Add Sync Item"** button
2. Enter a **name** (e.g., "My Documents")
3. Click **"Add Path"** to select files/folders
4. Choose **interval** from dropdown
5. If "Custom Interval", enter **number of hours**
6. Click **"Add Sync Item"**

### Example: Setting 12-Hour Backup
```
Name: Work Files
Paths: /home/user/work
Interval: Custom Interval
Hours: 12
```
Result: Backs up every 12 hours automatically

## Keyboard Shortcuts (Planned)
- `Ctrl+N` - New sync item
- `Ctrl+B` - Backup all
- `Ctrl+,` - Settings
- `Ctrl+Q` - Quit

## Status Indicators

### In Grid View
- ✓ Green checkmark - Sync item is enabled
- No checkmark - Sync item is disabled

### Backup Status
- 🟢 Green badge - Completed successfully
- 🔴 Red badge - Failed
- 🔵 Blue progress bar - In progress

### Next Backup Display
- `in Xh Ym` - Scheduled backup time
- `Overdue` - Missed scheduled backup
- `Manual` - Manual-only sync item

## Best Practices

### Organizing Sync Items
- Create separate sync items for different data types
- Example: "Documents", "Photos", "Music", "Work"
- Each can have different backup intervals

### Choosing Intervals
- **Critical data** - Every 1-6 hours
- **Daily work** - Every 12-24 hours
- **Archives** - Weekly or manual
- **Very large files** - Manual only

### Path Selection
- Select entire folders for easier management
- Individual files can be added for specific needs
- Mix files and folders in one sync item

## Troubleshooting

### Sync Item Not Backing Up
1. Check if item is **enabled** (green checkmark)
2. Verify **server settings** are configured
3. Check **API key** is valid
4. Review **next backup** time

### Large Uploads Failing
1. Check **internet connection** stability
2. Verify server has **sufficient storage**
3. Try **smaller batches** of files
4. Check **server logs** for errors

### Tray Icon Not Showing
1. Restart the application
2. Check system tray settings (Windows)
3. Verify icon file exists in `public/icon.png`

## File Locations

### Configuration Storage
- Sync items: Stored in Electron Store
- Settings: Stored in Electron Store
- Backup history: Stored in Electron Store

### Application Data
- **Windows**: `%APPDATA%/backupr`
- **macOS**: `~/Library/Application Support/backupr`
- **Linux**: `~/.config/backupr`

## API Communication

### Progress Events
JavaScript callback receives:
```javascript
{
    message: "Processing: file.txt",
    percent: 45,
    processedFiles: 23,
    totalFiles: 50,
    error: false
}
```

### Backup Result
```javascript
{
    success: true,
    backupName: "My Documents",
    version: 3,
    timestamp: "2025-11-03T...",
    filesCount: 50,
    totalSize: 1048576
}
```
