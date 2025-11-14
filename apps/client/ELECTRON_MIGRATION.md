# Electron Migration - Windows 7 Support

## Übersicht

Diese App wurde von Electron 28 auf Electron 22.3.27 migriert, um Windows 7-Unterstützung beizubehalten.

## Änderungen

### 1. Electron-Version
- **Vorher**: Electron 28.0.0
- **Nachher**: Electron 22.3.27 (letzte Version mit Windows 7 Support)

### 2. Auto-Updater Konfiguration
- **Repository geändert**: Von `backupr` zu `backupr-client`
- Dies verhindert Konflikte zwischen Client-Releases und Haupt-Repository-Releases
- Updates werden nun von `https://github.com/calirko/backupr-client` heruntergeladen

## Wichtige Hinweise

### Windows 7 Support
- Electron 22.x ist die letzte Version, die Windows 7 unterstützt
- Neuere Electron-Versionen (23+) erfordern mindestens Windows 10

### Release-Management
Um Releases zu erstellen, die vom Auto-Updater erkannt werden:

1. Erstellen Sie ein neues Repository: `backupr-client`
2. Pushen Sie Releases in dieses Repository mit GitHub Actions oder manuell
3. Der Auto-Updater prüft automatisch auf neue Releases in diesem Repository

### Build-Befehle
```bash
# Development
yarn dev

# Build für Windows
yarn build:win

# Package für alle Plattformen
yarn package
```

## Kompatibilität

### Unterstützte Windows-Versionen
- Windows 7 (Service Pack 1) ✓
- Windows 8/8.1 ✓
- Windows 10 ✓
- Windows 11 ✓

### Bekannte Einschränkungen
- Einige neuere Electron-Features sind in Version 22 nicht verfügbar
- Sicherheitsupdates für Electron 22 sind limitiert (da EOL)

## Zukünftige Überlegungen

Wenn Windows 7-Support nicht mehr benötigt wird:
1. Upgrade auf die neueste Electron-Version
2. Nutzen Sie moderne Electron-Features
3. Verbesserte Sicherheit durch aktuelle Chromium-Version

## Weitere Informationen

- [Electron 22 Release Notes](https://www.electronjs.org/blog/electron-22-0)
- [Electron Platform Support](https://www.electronjs.org/docs/latest/tutorial/support#supported-platforms)
- [electron-updater Documentation](https://www.electron.build/auto-update)
