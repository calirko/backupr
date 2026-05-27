//! Auto-update for the Backupr agent.
//!
//! # Update flow (`run_update`)
//! 1. Fetch latest release metadata from the GitHub releases API.
//! 2. Compare the `tag_name` against `CARGO_PKG_VERSION`.
//! 3. If newer: download the matching binary asset(s) into the exe directory.
//! 4. Atomically swap files on disk (rename old → `<name>.bak`, new → original).
//! 5. Spawn the new process with the same arguments, then exit.
//!
//! # Session info refresh (`refresh_session_info`)
//! Called on every WS reconnect so the dashboard always shows current
//! version, hostname, RAM, disk, and CPU info.

use anyhow::{Result, anyhow};
use serde::Deserialize;
use std::path::Path;

use crate::lib::config::AgentConfig;

const GITHUB_API_LATEST: &str = "https://api.github.com/repos/calirko/backupr/releases/latest";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

// ─── GitHub API types ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<ReleaseAsset>,
}

#[derive(Deserialize)]
struct ReleaseAsset {
    name: String,
    browser_download_url: String,
}

// ─── Version comparison ───────────────────────────────────────────────────────

/// Parses `"v1.2.3"` or `"1.2.3"` into `(1, 2, 3)`.
fn parse_version(s: &str) -> Option<(u32, u32, u32)> {
    let s = s.trim_start_matches('v');
    let mut it = s.splitn(3, '.');
    Some((
        it.next()?.parse().ok()?,
        it.next()?.parse().ok()?,
        // Strip any pre-release suffix (e.g. "0-alpha") before parsing.
        it.next()?
            .split(|c: char| !c.is_ascii_digit())
            .next()?
            .parse()
            .ok()?,
    ))
}

// ─── Platform-specific asset / binary names ───────────────────────────────────

/// Release asset name for the **agent** binary on this platform and arch.
///
/// Matches the filenames produced by `scripts/build-all.sh`:
/// `backupr-agent-{arch}-{os}[.exe]`
fn agent_asset_name() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "backupr-agent-x86_64-windows.exe",
        ("windows", "x86") => "backupr-agent-i686-windows.exe",
        ("linux", "x86_64") => "backupr-agent-x86_64-linux",
        ("linux", "x86") => "backupr-agent-i686-linux",
        _ => "backupr-agent-unknown",
    }
}

/// Release asset name for the **tray** binary, or `None` on non-Windows
/// (the tray is a Windows-only binary).
fn tray_asset_name() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Some("backupr-tray-x86_64-windows.exe"),
        ("windows", "x86") => Some("backupr-tray-i686-windows.exe"),
        _ => None,
    }
}

/// Local filename of the installed tray binary (sits next to the agent exe).
fn tray_local_filename() -> String {
    format!("tray{}", std::env::consts::EXE_SUFFIX)
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

fn http_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(format!("backupr-agent/{}", CURRENT_VERSION))
        .build()
        .map_err(|e| anyhow!("Failed to build HTTP client: {}", e))
}

async fn download_file(client: &reqwest::Client, url: &str, dest: &Path) -> Result<()> {
    println!("[Update] Downloading {} ...", url);
    let resp = client.get(url).send().await?;
    let status = resp.status();
    if !status.is_success() {
        anyhow::bail!("HTTP {} fetching {}", status, url);
    }
    let bytes = resp.bytes().await?;
    std::fs::write(dest, &bytes).map_err(|e| anyhow!("Cannot write {}: {}", dest.display(), e))?;

    // Ensure executables are runnable on Unix.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dest, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| anyhow!("Cannot chmod {}: {}", dest.display(), e))?;
    }

    println!("[Update] Saved {} bytes → {}", bytes.len(), dest.display());
    Ok(())
}

// ─── Binary replacement ───────────────────────────────────────────────────────

/// Atomically replaces `target` with `replacement`.
///
/// 1. Any stale `<target>.bak` is removed.
/// 2. `target` is renamed to `<target>.bak`.
/// 3. `replacement` is renamed to `target`.
///
/// On step-3 failure the original is restored from the `.bak` file.
/// Windows keeps a running EXE open by handle (not by name), so renaming
/// the live binary is safe. Linux inode semantics also allow it.
fn replace_binary(target: &Path, replacement: &Path) -> Result<()> {
    let filename = target
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| anyhow!("No filename: {}", target.display()))?;

    let bak = target.with_file_name(format!("{}.bak", filename));
    let _ = std::fs::remove_file(&bak); // stale backup — ignore error

    std::fs::rename(target, &bak).map_err(|e| {
        anyhow!(
            "Cannot back up {} → {}: {}",
            target.display(),
            bak.display(),
            e
        )
    })?;

    std::fs::rename(replacement, target).map_err(|e| {
        // Best-effort rollback: put the original back.
        let _ = std::fs::rename(&bak, target);
        anyhow!(
            "Cannot place new binary {} → {}: {}",
            replacement.display(),
            target.display(),
            e
        )
    })?;

    Ok(())
}

// ─── Self-restart ─────────────────────────────────────────────────────────────

/// Spawns the binary at `exe_path` (already replaced on disk) with the same
/// CLI arguments, then calls `std::process::exit(0)`.
///
/// This function never returns on success.
fn restart_self(exe_path: &Path) -> Result<()> {
    println!("[Update] Spawning updated process: {}", exe_path.display());
    std::process::Command::new(exe_path)
        .args(std::env::args().skip(1))
        .spawn()
        .map_err(|e| anyhow!("Failed to spawn updated agent: {}", e))?;
    println!("[Update] Update complete — exiting old process.");
    std::process::exit(0);
}

// ─── System info ─────────────────────────────────────────────────────────────

fn total_ram_bytes() -> u64 {
    #[cfg(target_os = "linux")]
    let result: u64 = std::fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with("MemTotal:"))?
                .split_whitespace()
                .nth(1)?
                .parse::<u64>()
                .ok()
                .map(|kb| kb * 1024)
        })
        .unwrap_or(0);

    #[cfg(target_os = "windows")]
    let result: u64 = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory",
        ])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0);

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    let result: u64 = 0;

    result
}

fn disk_available_bytes() -> u64 {
    #[cfg(target_os = "linux")]
    let result: u64 = std::process::Command::new("df")
        .args(["-B1", "--output=avail", "/"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.lines().nth(1).and_then(|l| l.trim().parse().ok()))
        .unwrap_or(0);

    #[cfg(target_os = "windows")]
    let result: u64 = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            "(Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\").FreeSpace",
        ])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0);

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    let result: u64 = 0;

    result
}

fn build_system_info() -> serde_json::Value {
    let hostname = hostname::get()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    serde_json::json!({
        "platform":       std::env::consts::OS,
        "arch":           std::env::consts::ARCH,
        "hostname":       hostname,
        "agent_version":  CURRENT_VERSION,
        "cpus":           num_cpus::get(),
        "release":        crate::setup::get_os_release(),
        "ram":            total_ram_bytes(),
        "disk_available": disk_available_bytes(),
    })
}

// ─── Public API ───────────────────────────────────────────────────────────────

/// POSTs current system info to the server so the dashboard always shows
/// up-to-date data (version, hostname, RAM, disk, etc.) after every reconnect
/// or update.
pub async fn refresh_session_info(config: &AgentConfig) -> Result<()> {
    let server_url = config
        .server_url
        .as_deref()
        .ok_or_else(|| anyhow!("Server URL not configured"))?
        .trim_end_matches('/');
    let token = config
        .agent_token
        .as_deref()
        .ok_or_else(|| anyhow!("Agent token not configured"))?;

    let client = http_client()?;
    let resp = client
        .patch(format!("{}/api/agent/session/info", server_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({ "info": build_system_info() }))
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Session info refresh returned {}: {}", status, body);
    }

    println!("[Update] Session info refreshed (v{}).", CURRENT_VERSION);
    Ok(())
}

/// Checks GitHub for a newer release, downloads the matching binaries,
/// atomically replaces the current ones on disk, then spawns the new
/// process and exits.
///
/// Returns `Ok(())` **without restarting** when already on the latest version.
pub async fn run_update() -> Result<()> {
    println!(
        "[Update] Checking for updates (current: v{}) ...",
        CURRENT_VERSION
    );

    let client = http_client()?;

    // 1. Fetch latest release metadata.
    let release: Release = client
        .get(GITHUB_API_LATEST)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| anyhow!("Failed to reach GitHub API: {}", e))?
        .json()
        .await
        .map_err(|e| anyhow!("Failed to parse GitHub API response: {}", e))?;

    let latest_str = release.tag_name.trim_start_matches('v');

    // 2. Compare versions.
    let current = parse_version(CURRENT_VERSION)
        .ok_or_else(|| anyhow!("Cannot parse current version '{}'", CURRENT_VERSION))?;
    let latest = parse_version(latest_str)
        .ok_or_else(|| anyhow!("Cannot parse release tag '{}'", release.tag_name))?;

    if latest <= current {
        println!("[Update] Already up to date (v{}).", CURRENT_VERSION);
        return Ok(());
    }

    println!(
        "[Update] New version available: v{} → v{}",
        CURRENT_VERSION, latest_str
    );

    // 3. Resolve the exe directory (all binaries live alongside the agent).
    let exe_path =
        std::env::current_exe().map_err(|e| anyhow!("Cannot resolve exe path: {}", e))?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| anyhow!("Exe has no parent directory: {}", exe_path.display()))?;

    // 4. Update the tray binary (Windows only — skip silently on other platforms
    //    or when the release doesn't include a tray asset).
    if let Some(asset_name) = tray_asset_name() {
        match release.assets.iter().find(|a| a.name == asset_name) {
            Some(asset) => {
                let tray_path = exe_dir.join(tray_local_filename());
                let tmp_path = exe_dir.join(format!("{}.new", asset_name));
                download_file(&client, &asset.browser_download_url, &tmp_path).await?;
                if tray_path.exists() {
                    replace_binary(&tray_path, &tmp_path)?;
                } else {
                    // Running headlessly — place the tray binary for future use.
                    std::fs::rename(&tmp_path, &tray_path)
                        .map_err(|e| anyhow!("Cannot place tray binary: {}", e))?;
                }
                println!("[Update] Tray binary updated.");
            }
            None => {
                println!(
                    "[Update] Warning: tray asset '{}' not in this release; skipping.",
                    asset_name
                );
            }
        }
    }

    // 5. Download and swap the agent binary (do this last since we exit right after).
    let asset_name = agent_asset_name();
    let agent_asset = release
        .assets
        .iter()
        .find(|a| a.name == asset_name)
        .ok_or_else(|| {
            anyhow!(
                "Agent asset '{}' not found in release '{}'",
                asset_name,
                release.tag_name
            )
        })?;

    let agent_tmp = exe_dir.join(format!("{}.new", asset_name));
    download_file(&client, &agent_asset.browser_download_url, &agent_tmp).await?;
    replace_binary(&exe_path, &agent_tmp)?;
    println!("[Update] Agent binary updated.");

    // 6. Spawn the updated process and exit — does not return on success.
    restart_self(&exe_path)
}
