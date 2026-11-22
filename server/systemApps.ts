import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SystemAppEntry {
  name: string;
  processName: string;
  path?: string;
  source: 'running' | 'installed' | 'catalog';
  windowTitle?: string;
}

const COMMON_APPS_CATALOG: SystemAppEntry[] = [
  { name: 'Google Chrome', processName: 'chrome.exe', source: 'catalog' },
  { name: 'Microsoft Edge', processName: 'msedge.exe', source: 'catalog' },
  { name: 'Mozilla Firefox', processName: 'firefox.exe', source: 'catalog' },
  { name: 'Brave Browser', processName: 'brave.exe', source: 'catalog' },
  { name: 'Opera / Opera GX', processName: 'opera.exe', source: 'catalog' },
  { name: 'Vivaldi', processName: 'vivaldi.exe', source: 'catalog' },
  { name: '1Password', processName: '1Password.exe', source: 'catalog' },
  { name: 'Bitwarden', processName: 'Bitwarden.exe', source: 'catalog' },
  { name: 'KeePassXC', processName: 'KeePassXC.exe', source: 'catalog' },
  { name: 'VALORANT', processName: 'VALORANT-Win64-Shipping.exe', source: 'catalog' },
  { name: 'Riot Client', processName: 'RiotClientUx.exe', source: 'catalog' },
  { name: 'Counter-Strike 2', processName: 'cs2.exe', source: 'catalog' },
  { name: 'League of Legends', processName: 'League of Legends.exe', source: 'catalog' },
  { name: 'Roblox', processName: 'RobloxPlayerBeta.exe', source: 'catalog' },
  { name: 'Minecraft (Java)', processName: 'javaw.exe', source: 'catalog' },
  { name: 'Steam', processName: 'steam.exe', source: 'catalog' },
  { name: 'Epic Games Launcher', processName: 'EpicGamesLauncher.exe', source: 'catalog' },
  { name: 'Discord', processName: 'Discord.exe', source: 'catalog' },
  { name: 'Visual Studio Code', processName: 'Code.exe', source: 'catalog' },
];

async function scanLinuxDesktopApps(): Promise<SystemAppEntry[]> {
  const dirs = [
    '/usr/share/applications',
    path.join(os.homedir(), '.local/share/applications'),
    '/var/lib/snapd/desktop/applications',
  ];
  const entries: SystemAppEntry[] = [];

  for (const dir of dirs) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files.slice(0, 120)) {
        if (!file.endsWith('.desktop')) continue;
        try {
          const content = await fs.readFile(path.join(dir, file), 'utf8');
          if (/NoDisplay\s*=\s*true/i.test(content)) continue;
          const nameMatch = content.match(/^Name=(.+)$/m);
          const execMatch = content.match(/^Exec=(.+)$/m);
          if (!nameMatch || !execMatch) continue;

          const name = nameMatch[1].trim();
          const rawCmd = execMatch[1].trim().split(/\s+/)[0].replace(/^["']|["']$/g, '');
          const processName = path.basename(rawCmd);
          if (!name || !processName) continue;

          entries.push({
            name,
            processName,
            path: rawCmd,
            source: 'installed',
          });
        } catch {
          // ignore unreadable desktop file
        }
      }
    } catch {
      // directory absent
    }
  }
  return entries;
}

async function scanMacApps(): Promise<SystemAppEntry[]> {
  const dirs = ['/Applications', path.join(os.homedir(), 'Applications')];
  const entries: SystemAppEntry[] = [];

  for (const dir of dirs) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.app')) continue;
        const name = file.replace(/\.app$/i, '');
        entries.push({
          name,
          processName: name,
          path: path.join(dir, file),
          source: 'installed',
        });
      }
    } catch {
      // ignore
    }
  }
  return entries;
}

async function scanWindowsApps(): Promise<SystemAppEntry[]> {
  const psScript = `
    $ErrorActionPreference = 'SilentlyContinue'
    $results = @()
    Get-Process | Where-Object { $_.MainWindowTitle -or $_.Path } | Select-Object -Unique ProcessName, Path, MainWindowTitle | ForEach-Object {
      $results += [PSCustomObject]@{
        name = if ($_.MainWindowTitle) { $_.MainWindowTitle } else { $_.ProcessName }
        processName = "$($_.ProcessName).exe"
        path = $_.Path
        source = 'running'
        windowTitle = $_.MainWindowTitle
      }
    }
    $shell = New-Object -ComObject WScript.Shell
    $startDirs = @(
      "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
      "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs"
    )
    foreach ($dir in $startDirs) {
      if (Test-Path $dir) {
        Get-ChildItem -Path $dir -Filter '*.lnk' -Recurse | Select-Object -First 120 | ForEach-Object {
          $sc = $shell.CreateShortcut($_.FullName)
          $target = $sc.TargetPath
          if ($target -and $target.ToLower().EndsWith('.exe')) {
            $proc = [System.IO.Path]::GetFileName($target)
            $results += [PSCustomObject]@{
              name = $_.BaseName
              processName = $proc
              path = $target
              source = 'installed'
              windowTitle = ''
            }
          }
        }
      }
    }
    $results | ConvertTo-Json -Compress
  `;

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { timeout: 6000, maxBuffer: 2 * 1024 * 1024 },
    );
    const trimmed = stdout.trim();
    if (!trimmed) return [];
    const parsed: unknown = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .filter((item): item is SystemAppEntry => Boolean(item && typeof item === 'object'))
      .map((item): SystemAppEntry => ({
        name: String(item.name || item.processName || '').trim(),
        processName: String(item.processName || '').trim(),
        path: item.path ? String(item.path) : undefined,
        source: item.source === 'running' ? 'running' : 'installed',
        windowTitle: item.windowTitle ? String(item.windowTitle) : undefined,
      }))
      .filter((item) => Boolean(item.name && item.processName));
  } catch {
    return [];
  }
}

export async function scanSystemApps(): Promise<SystemAppEntry[]> {
  const platform = process.platform;
  let detected: SystemAppEntry[] = [];

  if (platform === 'win32') {
    detected = await scanWindowsApps();
  } else if (platform === 'darwin') {
    detected = await scanMacApps();
  } else {
    detected = await scanLinuxDesktopApps();
  }

  const seen = new Map<string, SystemAppEntry>();
  const rank = { running: 3, installed: 2, catalog: 1 } as const;

  for (const app of [...detected, ...COMMON_APPS_CATALOG]) {
    const key = app.processName.toLowerCase();
    const existing = seen.get(key);
    if (!existing || rank[app.source] > rank[existing.source]) {
      seen.set(key, app);
    }
  }

  return Array.from(seen.values()).sort((a, b) => {
    const rankDiff = rank[b.source] - rank[a.source];
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name);
  });
}
