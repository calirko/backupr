# Dateinamen-Problem Behebung

## Problem
Windows sendet manchmal kurze Dateinamen (8.3 Format) wie `1YZO5O~A.FDB` statt der vollständigen Namen wie `adoma.fdb` an den Linux-Server.

## Lösung
1. **Client-seitig**: Verwendung von `fs.realpathSync()` um die wahren Dateipfade zu erhalten
2. **Server-seitig**: Fallback-Mechanismus für kurze Dateinamen

## Implementierte Änderungen

### Client (`main.js`)
- Neue `getProperFileName()` Funktion die `fs.realpathSync()` verwendet
- Anwendung auf alle Upload-Pfade (chunked und traditional)
- Anwendung auf Firebird-Backups

### Server (`backup-upload.ts` & `backup-chunked.ts`)
- Erkennung von Windows kurzen Dateinamen
- Fallback zu timestamp-basierten Namen bei kurzen Namen

## Test
Nach den Änderungen sollten Dateinamen korrekt übertragen werden:
- `C:\path\to\adoma.fdb` → `adoma.fdb` (statt `1YZO5O~A.FDB`)