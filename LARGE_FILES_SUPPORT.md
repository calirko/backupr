# Large File Upload Support

## Übersicht

Die Backupr-Anwendung unterstützt jetzt das Hochladen sehr großer Dateien ohne Speicher- oder Größenbeschränkungen auf Client und Server.

## Funktionsweise

### Zwei Upload-Modi

Die Anwendung verwendet automatisch den optimalen Upload-Modus basierend auf der Dateigröße:

1. **Standard-Upload** (für Dateien < 100MB)
   - Verwendet traditionelles multipart/form-data Upload
   - Optimiert für schnelle Übertragung kleinerer Dateien
   - Streaming für Dateien > 10MB

2. **Chunked Upload** (für Dateien ≥ 100MB)
   - Teilt große Dateien in 5MB Chunks auf
   - Lädt jeden Chunk separat hoch
   - Fügt Chunks serverseitig zusammen
   - Vermeidet Speicherprobleme bei sehr großen Dateien

### Server-Implementierung

Der Server bietet folgende neue Endpoints:

#### 1. Start Upload Session
```
POST /api/backup/upload/start
Content-Type: application/json
X-API-Key: <api-key>

Body:
{
  "backupName": "string",
  "fileName": "string",
  "fileSize": number,
  "totalChunks": number,
  "metadata": {}
}

Response:
{
  "success": true,
  "sessionId": "string",
  "version": number
}
```

#### 2. Upload Chunk
```
POST /api/backup/upload/chunk
Content-Type: multipart/form-data
X-API-Key: <api-key>

Body:
- sessionId: string
- chunkIndex: number
- chunk: File

Response:
{
  "success": true,
  "uploadedChunks": number,
  "totalChunks": number
}
```

#### 3. Complete Upload
```
POST /api/backup/upload/complete
Content-Type: application/json
X-API-Key: <api-key>

Body:
{
  "sessionId": "string"
}

Response:
{
  "success": true,
  "fileName": "string",
  "fileSize": number,
  "checksum": "string"
}
```

#### 4. Finalize Backup
```
POST /api/backup/finalize
Content-Type: application/json
X-API-Key: <api-key>

Body:
{
  "backupName": "string",
  "version": number
}

Response:
{
  "success": true,
  "backupId": "string",
  "backupName": "string",
  "version": number,
  "filesCount": number,
  "totalSize": string
}
```

### Client-Implementierung

Der Electron Client:

1. **Analysiert Dateigröße**
   - Prüft alle zu sichernden Dateien
   - Wählt automatisch Chunked Upload für Dateien ≥ 100MB

2. **Chunked Upload Prozess**
   ```javascript
   // 1. Session starten
   const { sessionId, version } = await startUpload(...)
   
   // 2. Datei in Chunks aufteilen und hochladen
   for (let i = 0; i < totalChunks; i++) {
     await uploadChunk(sessionId, i, chunkData)
   }
   
   // 3. Upload abschließen
   await completeUpload(sessionId)
   
   // 4. Backup finalisieren
   await finalizeBackup(backupName, version)
   ```

3. **Progress Tracking**
   - Zeigt Fortschritt pro Chunk
   - Berechnet Gesamt-Fortschritt über alle Dateien

## Vorteile

### Speichereffizienz
- ✅ Client lädt nur 5MB gleichzeitig in den Speicher
- ✅ Server verarbeitet Chunks einzeln
- ✅ Keine Größenbeschränkung für einzelne Dateien

### Zuverlässigkeit
- ✅ Chunk-basierter Upload reduziert Fehlerwahrscheinlichkeit
- ✅ Bessere Fehlerbehandlung bei Verbindungsabbrüchen
- ✅ Fortschrittsanzeige für lange Uploads

### Skalierbarkeit
- ✅ Unterstützt Dateien von GB bis TB Größe
- ✅ Keine Anpassung der HTTP-Server-Limits erforderlich
- ✅ Funktioniert mit Standard-Hardware

## Technische Details

### Chunk-Größe
- Standard: **5MB** pro Chunk
- Konfigurierbar in `main.js`: `CHUNK_SIZE = 5 * 1024 * 1024`

### Upload-Schwellenwert
- Standard: **100MB**
- Dateien < 100MB: Standard-Upload
- Dateien ≥ 100MB: Chunked Upload
- Konfigurierbar in `main.js`: `CHUNKED_THRESHOLD = 100 * 1024 * 1024`

### Temporäre Dateien
- Chunks werden in `.chunks/{isoDate}/` gespeichert
- Nach erfolgreichem Upload automatisch gelöscht
- Bei Fehler: Manuelle Bereinigung notwendig

### Checksummen
- SHA-256 Hash für jede Datei
- Berechnet nach vollständiger Zusammenführung
- Gespeichert in der Datenbank

## Kompatibilität

### Bestehende Backups
- ✅ Alle bestehenden Endpoints funktionieren weiterhin
- ✅ Alte Backups bleiben erhalten
- ✅ Automatische Wahl des Upload-Modus

### Netzwerk
- Funktioniert über LAN
- Funktioniert über WAN/Internet
- Empfohlen: Stabile Verbindung für große Dateien

## Fehlerbehebung

### "Upload session not found"
- Session abgelaufen oder ungültig
- Server neu gestartet (Sessions werden nicht persistiert)
- Lösung: Backup erneut starten

### "Not all chunks uploaded"
- Upload wurde unterbrochen
- Netzwerkfehler während des Uploads
- Lösung: Backup erneut durchführen

### Speicherprobleme trotz Chunking
- Zu viele parallele Uploads
- Chunk-Größe zu groß
- Lösung: `CHUNK_SIZE` verkleinern

## Beispiel-Verwendung

```javascript
// Backup mit großen Dateien
const result = await window.electron.performBackup({
  serverHost: 'http://192.168.1.100:3000',
  apiKey: 'your-api-key',
  backupName: 'Large Files Backup',
  files: [
    '/path/to/large/video.mp4',  // 5GB
    '/path/to/database.bak',      // 2GB
    '/path/to/archive.zip'        // 500MB
  ]
});

// Chunked Upload wird automatisch für alle Dateien ≥ 100MB verwendet
```

## Performance

### Upload-Geschwindigkeit
- Abhängig von Netzwerkgeschwindigkeit
- Chunking fügt minimalen Overhead hinzu (~2-5%)
- Optimal für große Dateien über langsame Verbindungen

### Server-Last
- Niedrige CPU-Last (kein Komprimierung während Upload)
- Moderate Disk I/O
- Minimaler RAM-Verbrauch

## Zukünftige Verbesserungen

- [ ] Parallele Chunk-Uploads
- [ ] Resume-Funktionalität bei Abbruch
- [ ] Komprimierung vor Upload
- [ ] Deduplizierung identischer Dateien
- [ ] Delta-Uploads (nur Änderungen)
