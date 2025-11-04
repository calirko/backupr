import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Folder, X, Upload, Trash2, Edit, Plus, Clock, CheckCircle, File, Database } from 'lucide-react';
import { toast } from './ui/use-toast';

export function Backup() {
  const [syncItems, setSyncItems] = useState([]);
  const [settings, setSettings] = useState({ serverHost: '', apiKey: '' });
  const [editingItem, setEditingItem] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ message: '', percent: 0 });

  // Form state for new/edit item
  const [formData, setFormData] = useState({
    name: '',
    paths: [],
    backupType: 'normal', // 'normal' or 'firebird'
    firebirdDbPath: '',
    gbakPath: '',
    interval: 'manual',
    customHours: '',
    enabled: true
  });

  useEffect(() => {
    loadSettings();
    loadSyncItems();

    // Listen for progress updates
    if (window.electron && window.electron.onBackupProgress) {
      window.electron.onBackupProgress((data) => {
        setUploadProgress(data);
      });
    }

    // Listen for tray backup trigger
    if (window.electron && window.electron.onTriggerBackup) {
      window.electron.onTriggerBackup(() => {
        handleBackupAll();
      });
    }
  }, []);

  const loadSettings = async () => {
    if (window.electron) {
      const data = await window.electron.getSettings();
      setSettings(data);
    }
  };

  const loadSyncItems = async () => {
    if (window.electron) {
      const items = await window.electron.getSyncItems();
      setSyncItems(items || []);
    }
  };

  const handleAddPath = async () => {
    if (window.electron) {
      const filePaths = await window.electron.selectFiles();
      if (filePaths && filePaths.length > 0) {
        setFormData(prev => ({
          ...prev,
          paths: [...prev.paths, ...filePaths]
        }));
      }
    }
  };

  const handleAddFilesOnly = async () => {
    if (window.electron) {
      const filePaths = await window.electron.selectFilesOnly();
      if (filePaths && filePaths.length > 0) {
        setFormData(prev => ({
          ...prev,
          paths: [...prev.paths, ...filePaths]
        }));
      }
    }
  };

  const handleAddDirectories = async () => {
    if (window.electron) {
      const filePaths = await window.electron.selectDirectories();
      if (filePaths && filePaths.length > 0) {
        setFormData(prev => ({
          ...prev,
          paths: [...prev.paths, ...filePaths]
        }));
      }
    }
  };

  const handleSelectFirebirdDb = async () => {
    if (window.electron) {
      const dbPath = await window.electron.selectFirebirdDb();
      if (dbPath) {
        setFormData(prev => ({
          ...prev,
          firebirdDbPath: dbPath
        }));
      }
    }
  };

  const handleRemovePath = (index) => {
    setFormData(prev => ({
      ...prev,
      paths: prev.paths.filter((_, i) => i !== index)
    }));
  };

  const handleSaveItem = async () => {
    if (!formData.name) {
      toast({
        title: "Name required",
        description: "Please enter a name for the sync item",
        variant: "destructive",
      });
      return;
    }

    if (formData.backupType === 'normal' && formData.paths.length === 0) {
      toast({
        title: "No paths selected",
        description: "Please add at least one file or directory",
        variant: "destructive",
      });
      return;
    }

    if (formData.backupType === 'firebird' && !formData.firebirdDbPath) {
      toast({
        title: "No database selected",
        description: "Please select a Firebird database file",
        variant: "destructive",
      });
      return;
    }

    if (window.electron) {
      const item = {
        ...formData,
        id: editingItem?.id || null,
        lastBackup: editingItem?.lastBackup || null,
        nextBackup: calculateNextBackup(formData.interval, formData.customHours)
      };

      await window.electron.saveSyncItem(item);
      await loadSyncItems();
      resetForm();
    }
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      paths: item.paths,
      interval: item.interval,
      customHours: item.customHours || '',
      enabled: item.enabled,
      backupType: item.backupType || 'normal',
      firebirdDbPath: item.firebirdDbPath || '',
      gbakPath: item.gbakPath || ''
    });
    setShowAddForm(true);
  };

  const handleDeleteItem = async (itemId) => {
    if (confirm('Are you sure you want to delete this sync item?')) {
      if (window.electron) {
        await window.electron.deleteSyncItem(itemId);
        await loadSyncItems();
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      paths: [],
      interval: 'manual',
      customHours: '',
      enabled: true,
      backupType: 'normal',
      firebirdDbPath: '',
      gbakPath: ''
    });
    setEditingItem(null);
    setShowAddForm(false);
  };

  const calculateNextBackup = (interval, customHours) => {
    const now = new Date();
    switch (interval) {
      case 'manual':
        return null;
      case 'hourly':
        return new Date(now.getTime() + 60 * 60 * 1000);
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'custom': {
        const hours = parseInt(customHours) || 12;
        return new Date(now.getTime() + hours * 60 * 60 * 1000);
      }
      default:
        return null;
    }
  };

  const handleBackupItem = async (item) => {
    if (!settings.serverHost || !settings.apiKey) {
      toast({
        title: "Configuration required",
        description: "Please configure server settings first in the Settings tab",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setUploadProgress({ message: 'Starting backup...', percent: 0 });

    try {
      if (window.electron) {
        let result;
        
        if (item.backupType === 'firebird') {
          // Perform Firebird database backup
          result = await window.electron.performFirebirdBackup({
            serverHost: settings.serverHost,
            apiKey: settings.apiKey,
            backupName: item.name,
            dbPath: item.firebirdDbPath,
            gbakPath: item.gbakPath || undefined
          });
        } else {
          // Perform normal file/folder backup
          result = await window.electron.performBackup({
            serverHost: settings.serverHost,
            apiKey: settings.apiKey,
            backupName: item.name,
            files: item.paths
          });
        }

        if (result.success) {
          toast({
            title: "Backup successful",
            description: `"${item.name}" backed up successfully! Version ${result.version}`,
          });
          
          // Update last backup time
          const updatedItem = {
            ...item,
            lastBackup: new Date().toISOString(),
            nextBackup: calculateNextBackup(item.interval, item.customHours)
          };
          await window.electron.saveSyncItem(updatedItem);
          await loadSyncItems();
        } else {
          toast({
            title: "Backup failed",
            description: result.error || "An error occurred during backup",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Backup error:', error);
      toast({
        title: "Backup error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadProgress({ message: '', percent: 0 });
    }
  };

  const handleBackupAll = async () => {
    const enabledItems = syncItems.filter(item => item.enabled);
    if (enabledItems.length === 0) {
      toast({
        title: "No items to backup",
        description: "Please enable at least one sync item",
        variant: "destructive",
      });
      return;
    }

    for (const item of enabledItems) {
      await handleBackupItem(item);
    }
  };

  const getIntervalDisplay = (interval, customHours) => {
    switch (interval) {
      case 'manual':
        return 'Manual';
      case 'hourly':
        return 'Every hour';
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'custom':
        return `Every ${customHours || 12} hours`;
      default:
        return interval;
    }
  };

  const formatNextBackup = (nextBackup) => {
    if (!nextBackup) return 'Manual';
    const date = new Date(nextBackup);
    const now = new Date();
    const diff = date - now;
    
    if (diff < 0) return 'Overdue';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `in ${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `in ${hours}h ${minutes}m`;
    } else {
      return `in ${minutes}m`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Sync Items</h2>
          <p className="text-muted-foreground">Manage your backup configurations</p>
        </div>
        <Button onClick={() => setShowAddForm(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Sync Item
        </Button>
      </div>

      {/* Upload Progress */}
      {uploading && uploadProgress.message && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{uploadProgress.message}</span>
                <span className="text-sm text-muted-foreground">{Math.round(uploadProgress.percent)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress.percent}%` }}
                ></div>
              </div>
              {uploadProgress.processedFiles !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Files: {uploadProgress.processedFiles} / {uploadProgress.totalFiles}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <Card className="border">
          <CardHeader>
            <CardTitle>{editingItem ? 'Edit Sync Item' : 'New Sync Item'}</CardTitle>
            <CardDescription>Configure what and when to backup</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="itemName">Sync Item Name</Label>
              <Input
                id="itemName"
                placeholder="e.g., My Documents, Photos, Work Files"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Backup Type</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="backupType"
                    value="normal"
                    checked={formData.backupType === 'normal'}
                    onChange={(e) => setFormData(prev => ({ ...prev, backupType: e.target.value }))}
                    className="w-4 h-4"
                  />
                  <File className="h-4 w-4" />
                  <span>Files & Folders</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="backupType"
                    value="firebird"
                    checked={formData.backupType === 'firebird'}
                    onChange={(e) => setFormData(prev => ({ ...prev, backupType: e.target.value }))}
                    className="w-4 h-4"
                  />
                  <Database className="h-4 w-4" />
                  <span>Firebird Database</span>
                </label>
              </div>
            </div>

            {formData.backupType === 'normal' ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Files and Folders</Label>
                  <div className="flex gap-2">
                    <Button onClick={handleAddFilesOnly} size="sm" variant="outline">
                      <File className="mr-2 h-4 w-4" />
                      Add Files
                    </Button>
                    <Button onClick={handleAddDirectories} size="sm" variant="outline">
                      <Folder className="mr-2 h-4 w-4" />
                      Add Folders
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 min-h-[100px] max-h-[200px] overflow-auto border rounded-md p-3">
                  {formData.paths.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No paths added yet
                    </p>
                  ) : (
                    formData.paths.map((filePath, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-secondary rounded-md"
                      >
                        <span className="text-sm truncate flex-1" title={filePath}>{filePath}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemovePath(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Firebird Database File</Label>
                    <Button onClick={handleSelectFirebirdDb} size="sm" variant="outline">
                      <Database className="mr-2 h-4 w-4" />
                      Select Database
                    </Button>
                  </div>
                  {formData.firebirdDbPath ? (
                    <div className="p-3 bg-secondary rounded-md">
                      <p className="text-sm truncate" title={formData.firebirdDbPath}>
                        {formData.firebirdDbPath}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                      No database selected
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="gbakPath">
                    gbak Path <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="gbakPath"
                    placeholder="Leave empty for auto-detect"
                    value={formData.gbakPath}
                    onChange={(e) => setFormData(prev => ({ ...prev, gbakPath: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Path to gbak executable. Leave empty to auto-detect from common locations.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="interval">Sync Interval</Label>
                <Select 
                  value={formData.interval} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, interval: value }))}
                >
                  <SelectTrigger id="interval">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual Only</SelectItem>
                    <SelectItem value="hourly">Every Hour</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="custom">Custom Interval</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.interval === 'custom' && (
                <div className="space-y-2">
                  <Label htmlFor="customHours">Hours</Label>
                  <Input
                    id="customHours"
                    type="number"
                    min="1"
                    max="168"
                    placeholder="12"
                    value={formData.customHours}
                    onChange={(e) => setFormData(prev => ({ ...prev, customHours: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button onClick={handleSaveItem}>
                {editingItem ? 'Update' : 'Add'} Sync Item
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Items Grid */}
      {syncItems.length === 0 && !showAddForm ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No sync items configured</h3>
            <p className="text-muted-foreground mb-4">Add your first sync item to get started</p>
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Sync Item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {syncItems.map((item) => (
            <Card key={item.id} className={item.enabled ? '' : 'opacity-60'}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {item.backupType === 'firebird' ? (
                        <Database className="h-4 w-4 text-orange-600" />
                      ) : (
                        <File className="h-4 w-4 text-blue-600" />
                      )}
                      {item.name}
                      {item.enabled && (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      <Clock className="inline h-3 w-3 mr-1" />
                      {getIntervalDisplay(item.interval, item.customHours)}
                      {item.backupType === 'firebird' && (
                        <span className="ml-2 text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded">
                          Firebird DB
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditItem(item)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {item.backupType === 'firebird' ? (
                  <div className="text-sm">
                    <p className="text-muted-foreground font-medium mb-1">Database File:</p>
                    <p className="text-xs truncate bg-secondary px-2 py-1 rounded" title={item.firebirdDbPath}>
                      {item.firebirdDbPath}
                    </p>
                    {item.gbakPath && (
                      <div className="mt-2">
                        <p className="text-muted-foreground font-medium mb-1">gbak Path:</p>
                        <p className="text-xs truncate bg-secondary px-2 py-1 rounded" title={item.gbakPath}>
                          {item.gbakPath}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm">
                    <p className="text-muted-foreground font-medium mb-1">Paths ({item.paths?.length || 0}):</p>
                    <div className="space-y-1">
                      {item.paths?.slice(0, 2).map((p, i) => (
                        <p key={i} className="text-xs truncate bg-secondary px-2 py-1 rounded" title={p}>
                          {p}
                        </p>
                      ))}
                      {item.paths?.length > 2 && (
                        <p className="text-xs text-muted-foreground">
                          +{item.paths.length - 2} more...
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <div>
                    {item.lastBackup ? (
                      <span>Last: {new Date(item.lastBackup).toLocaleDateString()}</span>
                    ) : (
                      <span>Never backed up</span>
                    )}
                  </div>
                  <div>
                    Next: {formatNextBackup(item.nextBackup)}
                  </div>
                </div>

                <Button 
                  onClick={() => handleBackupItem(item)} 
                  disabled={uploading || !item.enabled}
                  className="w-full"
                  size="sm"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Backup Now
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Backup All Button */}
      {syncItems.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <Button 
              onClick={handleBackupAll} 
              disabled={uploading}
              className="w-full"
              size="lg"
            >
              <Upload className="mr-2 h-5 w-5" />
              Backup All Enabled Items
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
