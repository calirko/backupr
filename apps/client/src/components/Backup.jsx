import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Folder, X } from 'lucide-react';

export function Backup() {
  const [backupConfig, setBackupConfig] = useState({
    files: [],
    period: 'daily'
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadBackupConfig();
  }, []);

  const loadBackupConfig = async () => {
    if (window.electron) {
      const config = await window.electron.getBackupConfig();
      setBackupConfig(config);
    }
  };

  const handleAddFile = () => {
    // In a real implementation, this would open a file picker dialog
    // For now, we'll add a placeholder
    const newFile = prompt('Enter file path to backup:');
    if (newFile) {
      setBackupConfig(prev => ({
        ...prev,
        files: [...prev.files, newFile]
      }));
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Backup Configuration</CardTitle>
          <CardDescription>Select files and folders to backup</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>
          {saved ? 'Configuration Saved!' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  );
}
