# Auto-Update System

The Backupr client now includes an automatic update system that checks for new releases from the GitHub repository (`calirko/backupr`) and allows users to update the application seamlessly.

## Features

- **Automatic Update Check on Startup**: The app checks for updates 3 seconds after launching (only in production builds)
- **Manual Update Check**: Users can check for updates via the tray menu option "Check for Updates"
- **User Confirmation**: Users are prompted before downloading updates
- **Background Download**: Updates download in the background with progress notifications
- **Install on Restart**: Updates are installed when the user quits and restarts the app

## How It Works

### For Users

1. **Automatic Check**: When you start Backupr, it automatically checks for updates in the background
2. **Update Available**: If an update is found, you'll see a dialog asking if you want to download it
3. **Download**: Click "Download" to start downloading the update in the background
4. **Install**: Once downloaded, you can choose to restart now or later. The update will be installed when the app restarts
5. **Manual Check**: Right-click the tray icon and select "Check for Updates" to manually check anytime

### For Developers

#### Publishing Updates

1. **Update Version**: Increment the version in `apps/client/package.json`:
   ```json
   {
     "version": "1.0.1"
   }
   ```

2. **Build the App**:
   ```bash
   cd apps/client
   npm run build
   npm run package
   ```

3. **Create GitHub Release**:
   - Go to your GitHub repository: https://github.com/calirko/backupr
   - Click "Releases" → "Create a new release"
   - Tag version: `v1.0.1` (must match package.json version with 'v' prefix)
   - Release title: `Backupr v1.0.1`
   - Upload the built files from `apps/client/out/` directory:
     - For Windows: Upload the `.exe` installer and `.yml` files
     - For macOS: Upload the `.dmg` and `.zip` files plus `.yml` files
     - For Linux: Upload the `.AppImage` and `.deb` files plus `.yml` files
   - Publish the release

4. **Automatic Distribution**: electron-updater will automatically detect the new release and notify users

#### Important Files

- **electron-builder.json**: Contains the publish configuration pointing to your GitHub repo
  ```json
  "publish": {
    "provider": "github",
    "owner": "calirko",
    "repo": "backupr"
  }
  ```

- **main.js**: Contains the auto-updater logic and event handlers

#### Environment Variables (Optional)

For private repositories, you may need to set a GitHub token:
```bash
export GH_TOKEN="your_github_token"
```

## Configuration

The auto-updater is configured to:
- **Not auto-download**: Users must confirm before downloading
- **Auto-install on quit**: Updates install automatically when the app quits
- **Check on startup**: Only in production builds (skipped in development)

## Testing

To test the auto-update system:

1. Build and package the app with version 1.0.0
2. Create a GitHub release v1.0.0 with the built files
3. Install the app on your machine
4. Update the version to 1.0.1 in package.json
5. Build, package, and create a new release v1.0.1
6. Launch the installed app and it should detect the update

## Troubleshooting

### Update Check Fails
- Ensure you're running a production build (not in development mode)
- Check your internet connection
- Verify the GitHub repository is public or you have proper authentication
- Check the console logs for detailed error messages

### Update Not Detected
- Ensure the version in package.json is properly incremented
- Verify the release tag matches the version (e.g., v1.0.1 for version 1.0.1)
- Check that all required files are uploaded to the GitHub release
- Ensure the `.yml` files are included in the release

### Update Download Fails
- Check network connectivity
- Verify the release assets are properly uploaded
- Check file permissions

## Security

- All updates are served over HTTPS from GitHub
- electron-updater verifies file signatures (when signing is configured)
- Users must explicitly confirm downloads

## Future Enhancements

Potential improvements:
- Add code signing for enhanced security
- Implement delta updates for faster downloads
- Add update notifications in the app UI
- Configure auto-download for minor/patch updates
