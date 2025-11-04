import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Folder, X, Upload, History } from 'lucide-react';

export function Backup() {
  const [backupConfig, setBackupConfig] = useState({
    files: [],
    period: 'daily',
    backupName: ''
  });
  const [settings, setSettings] = useState({ serverHost: '', apiKey: '' });
  const [uploading, setUploading] = useState(false);
  const [backupHistory, setBackupHistory] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadBackupConfig();
    loadSettings();
    loadBackupHistory();
  }, []);

  const loadSettings = async () => {
    if (window.electron) {
      const data = await window.electron.getSettings();
      setSettings(data);
    }
  };

  const loadBackupConfig = async () => {
    if (window.electron) {
      const config = await window.electron.getBackupConfig();
      setBackupConfig(config);
    }
  };

  const loadBackupHistory = async () => {
    if (window.electron) {
      const history = await window.electron.getBackupHistory();
      setBackupHistory(history || []);
    }
  };

  const handleAddFile = async () => {
    if (window.electron) {
      const filePaths = await window.electron.selectFiles();
      if (filePaths && filePaths.length > 0) {
        setBackupConfig(prev => ({
          ...prev,
          files: [...prev.files, ...filePaths]
        }));
      }
    }
  };

  const handleRemoveFile = (index) => {
    setBackupConfig(prev => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index)
    }));
  };

  const handlePeriodChange = (value) => {
    setBackupConfig(prev => ({
      ...prev,
      period: value
    }));
  };

  const handleSave = async () => {
    if (window.electron) {
      await window.electron.saveBackupConfig(backupConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleBackupNow = async () => {
    if (!settings.serverHost || !settings.apiKey) {
      alert('Please configure server settings first!');
      return;
    }

    if (!backupConfig.backupName) {
      alert('Please enter a backup name!');
      return;
    }

    if (backupConfig.files.length === 0) {
      alert('Please add files to backup!');
      return;
    }

    setUploading(true);
    
    try {
      if (window.electron) {
        const result = await window.electron.performBackup({
          serverHost: settings.serverHost,
          apiKey: settings.apiKey,
          backupName: backupConfig.backupName,
          files: backupConfig.files
        });
        
        if (result.success) {
          alert(`Backup successful! Version ${result.version}`);
          await loadBackupHistory();
        } else {
          alert(`Backup failed: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Backup error:', error);
      alert(`Backup failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Backup Configuration</CardTitle>
          <CardDescription>Select files and folders to backup</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="backupName">Backup Name</Label>
            <Input
              id="backupName"
              placeholder="e.g., My Documents, Photos, etc."
              value={backupConfig.backupName}
              onChange={(e) => setBackupConfig(prev => ({ ...prev, backupName: e.target.value }))}
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Files and Folders</Label>
              <Button onClick={handleAddFile} size="sm">
                <Folder className="mr-2 h-4 w-4" />
                Add File/Folder
              </Button>
            </div>
            <div className="space-y-2 min-h-[200px] max-h-[300px] overflow-auto border rounded-md p-4">
              {backupConfig.files.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No files or folders added yet
                </p>
              ) : (
                backupConfig.files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-secondary rounded-md"
                  >
                    <span className="text-sm truncate flex-1">{file}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFile(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="period">Backup Period</Label>
            <Select value={backupConfig.period} onValueChange={handlePeriodChange}>
              <SelectTrigger id="period">
                <SelectValue placeholder="Select backup period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual Only</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup Actions</CardTitle>
          <CardDescription>Perform backup operations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleBackupNow} disabled={uploading} className="flex-1">
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? 'Uploading...' : 'Backup Now'}
            </Button>
            <Button onClick={handleSave} variant="outline">
              {saved ? 'Saved!' : 'Save Config'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {backupHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <History className="inline mr-2 h-5 w-5" />
              Recent Backups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {backupHistory.slice(0, 10).map((backup, index) => (
                <div key={index} className="flex justify-between items-center p-2 bg-secondary rounded-md text-sm">
                  <div>
                    <div className="font-medium">{backup.backupName} v{backup.version}</div>
                    <div className="text-muted-foreground text-xs">
                      {new Date(backup.timestamp).toLocaleString()} • {backup.filesCount} files
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs ${
                    backup.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {backup.status}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
