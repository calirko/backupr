import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Settings } from './components/Settings';
import { Backup } from './components/Backup';

function App() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Backupr</h1>
          <p className="text-muted-foreground">Simple file backup tool</p>
        </div>

        <Tabs defaultValue="backup" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="backup">Backup</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="backup">
            <Backup />
          </TabsContent>
          <TabsContent value="settings">
            <Settings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default App;
