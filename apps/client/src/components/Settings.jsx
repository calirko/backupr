import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';

export function Settings() {
  const [settings, setSettings] = useState({
    serverHost: '',
    apiKey: '',
    dbConfig: {
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'backupr'
    }
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

  const updateDbConfig = (field, value) => {
    setSettings(prev => ({
      ...prev,
      dbConfig: {
        ...prev.dbConfig,
        [field]: value
      }
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
          <CardTitle>Database Settings</CardTitle>
          <CardDescription>Configure MySQL database connection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dbHost">Host</Label>
            <Input
              id="dbHost"
              placeholder="localhost"
              value={settings.dbConfig.host}
              onChange={(e) => updateDbConfig('host', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dbUser">User</Label>
            <Input
              id="dbUser"
              placeholder="root"
              value={settings.dbConfig.user}
              onChange={(e) => updateDbConfig('user', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dbPassword">Password</Label>
            <Input
              id="dbPassword"
              type="password"
              placeholder="Database password"
              value={settings.dbConfig.password}
              onChange={(e) => updateDbConfig('password', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dbName">Database Name</Label>
            <Input
              id="dbName"
              placeholder="backupr"
              value={settings.dbConfig.database}
              onChange={(e) => updateDbConfig('database', e.target.value)}
            />
          </div>
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
