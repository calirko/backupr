import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ResEdit from 'resedit';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const [verMajor, verMinor, verPatch] = version.split('.').map(Number);

const META = {
  company:   'Calirko',
  copyright: `Copyright © ${new Date().getFullYear()} Calirko. All rights reserved.`,
};

const output = resolve(root, 'dist/backupr-agent.exe');
const toArrayBuffer = (buf) =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

mkdirSync(resolve(root, 'dist'), { recursive: true });

// 1. Compile
console.log('▸ Compiling with Bun...');
execFileSync(
  'bun',
  ['build', '--compile', '--target=bun-windows-x64', './src/main.ts', '--outfile', output],
  { cwd: root, stdio: 'inherit' },
);

// 2. Patch subsystem version for Windows Server 2008 compatibility
console.log('▸ Patching for Windows Server 2008 compatibility...');
const exeBuffer = readFileSync(output);
const view = new DataView(exeBuffer.buffer, exeBuffer.byteOffset, exeBuffer.byteLength);

// PE signature offset is at 0x3C
const peOffset = view.getUint32(0x3C, true);
// Optional header is at PE offset + 24
const optHeaderOffset = peOffset + 24;
// Subsystem version is at optional header offset + 40 (Win32VersionValue for subsystem)
// We need to set: major version 5 (for Server 2008), minor version 2
// Subsystem version offset: optional header + 34 for major (2 bytes) + optional header + 36 for minor (2 bytes)
const subsysVersionOffset = optHeaderOffset + 34;

// Set subsystem version: 5.2 = Windows Server 2003 (closest below Server 2008 that's widely compatible)
// For broader compatibility, use 5.1 = Windows XP
view.setUint16(subsysVersionOffset, 5, true);           // Major version
view.setUint16(subsysVersionOffset + 2, 1, true);       // Minor version

writeFileSync(output, exeBuffer);

// 3. Stamp version info
console.log('▸ Setting version info...');
try {
  const exe = ResEdit.NtExecutable.from(toArrayBuffer(readFileSync(output)), { ignoreCert: true, ignoreDuplicateDirs: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const viList = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  if (viList.length > 0) {
    const vi = viList[0];
    vi.setFileVersion(verMajor, verMinor, verPatch, 0);
    vi.setProductVersion(verMajor, verMinor, verPatch, 0);
    vi.setStringValues(
      { lang: 1033, codepage: 1200 },
      {
        CompanyName:      META.company,
        FileDescription:  'Backupr Agent',
        FileVersion:      version,
        ProductName:      'Backupr',
        ProductVersion:   version,
        InternalName:     'Backupr',
        OriginalFilename: 'backupr-agent.exe',
        LegalCopyright:   META.copyright,
      },
    );
    vi.outputToResourceEntries(res.entries);
    res.outputResource(exe);
    writeFileSync(output, Buffer.from(exe.generate()));
  }
} catch (err) {
  console.warn('⚠ Warning: Could not set version info:', err.message);
}

const size = readFileSync(output).byteLength;
console.log(`✓ dist/backupr-agent.exe  ${(size / 1024 / 1024).toFixed(1)} MB (Windows Server 2008+)`);
