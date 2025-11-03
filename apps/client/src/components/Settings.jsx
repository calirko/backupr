import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';

export function Settings() {
  const [settings, setSettings] = useState({
    serverHost: '',
    apiKey: ''
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    if (window.electron) {
      const data = await window.electron.getSettings();
      setSettings(data);
    }
  };

  const handleSave = async () => {
    if (window.electron) {
      await window.electron.saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const updateSetting = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Server Settings</CardTitle>
          <CardDescription>Configure your backup server connection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="serverHost">Server Host</Label>
            <Input
              id="serverHost"
              placeholder="http://localhost:3000"
              value={settings.serverHost}
              onChange={(e) => updateSetting('serverHost', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Your API key"
              value={settings.apiKey}
              onChange={(e) => updateSetting('apiKey', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Local Database</CardTitle>
          <CardDescription>SQLite database is automatically managed in your application data folder</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The local database is used to store sync history and backup configurations. 
            It's automatically created and managed by the application.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>
          {saved ? 'Settings Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
