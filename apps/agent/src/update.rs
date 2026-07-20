//! Auto-update for the Backupr agent.
//!
//! # Update flow
//! 1. `run_update()` - called when the server sends an "update" command:
//!    a. Fetches the latest GitHub release metadata.
//!    b. Downloads new binaries to `<dir>/<asset>.new` files.
//!    c. **Windows**: spawns `agent apply-update` as an independent helper process and returns (does NOT exit - lets WinSW stop the service).
//!    d. **Linux**: replaces binaries in-place and restarts the process.
//!
//! 2. `run_apply_update_helper()` - entry point for the `apply-update`
//!    subcommand (a short-lived helper process, Windows only):
//!    a. Stops the WinSW service (`sc stop`).
//!    b. Kills all tray processes (for every logged-in user).
//!    c. Atomically swaps the downloaded `.new` binaries into place.
//!    d. Starts the WinSW service (`sc start`).
//!    e. Exits.
//!
//! # Session info refresh (`refresh_session_info`)
//! Called on every WS reconnect so the dashboard always shows current
//! version, hostname, RAM, disk, and CPU info.

use anyhow::{Result, anyhow};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use crate::lib::config::AgentConfig;

static UPDATE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

const GITHUB_API_LATEST: &str = "https://api.github.com/repos/calirko/backupr/releases/latest";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Public half of the Ed25519 keypair used to sign release binaries
/// (generated with `scripts/keygen.sh`; private key never leaves the
/// release machine). Every downloaded update must carry a valid `.sig`
/// asset verifying against this key before it's swapped into place - this
/// is what stops a compromised/spoofed GitHub release (or a MITM on the
/// download) from getting the agent to self-replace with an arbitrary
/// binary, which is also the exact "process rewrites its own exe and
/// restarts as a service" pattern that trips AV/EDR behavioral heuristics.
const UPDATE_PUBLIC_KEY_HEX: &str =
    "a23ed9730d4c0eb81523eebdd534e0126b400fee9fd4fa9fdbc1c90315d5588a";

fn update_public_key() -> VerifyingKey {
    let bytes = decode_hex(UPDATE_PUBLIC_KEY_HEX)
        .try_into()
        .expect("UPDATE_PUBLIC_KEY_HEX must decode to exactly 32 bytes");
    VerifyingKey::from_bytes(&bytes).expect("UPDATE_PUBLIC_KEY_HEX is not a valid Ed25519 key")
}

fn decode_hex(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).expect("UPDATE_PUBLIC_KEY_HEX is not hex"))
        .collect()
}

/// Verifies `data` against `sig_bytes` (a raw 64-byte Ed25519 signature, as
/// produced by `openssl pkeyutl -sign -rawin`) using the embedded release
/// public key. Callers must refuse to apply an update on any error here.
fn verify_update_signature(data: &[u8], sig_bytes: &[u8]) -> Result<()> {
    let sig = Signature::from_slice(sig_bytes)
        .map_err(|e| anyhow!("Malformed update signature: {}", e))?;
    update_public_key()
        .verify(data, &sig)
        .map_err(|_| anyhow!("Update signature does not verify against the embedded public key"))
}
/// Service name as registered by setup.ps1 (`$ServiceName = "backupr-agent"`).
#[cfg(target_os = "windows")]
const WINSW_SERVICE_NAME: &str = "backupr-agent";

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
///
/// Must match `$TrayExe` in setup.ps1 (`backupr-tray.exe`).
pub fn tray_local_filename() -> &'static str {
    #[cfg(target_os = "windows")]
    let name = "backupr-tray.exe"; // matches setup.ps1 $TrayExe
    #[cfg(not(target_os = "windows"))]
    let name = "tray";
    name
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

fn http_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(format!("backupr-agent/{}", CURRENT_VERSION))
        .build()
        .map_err(|e| anyhow!("Failed to build HTTP client: {}", e))
}

async fn fetch_bytes(client: &reqwest::Client, url: &str) -> Result<Vec<u8>> {
    let resp = client.get(url).send().await?;
    let status = resp.status();
    if !status.is_success() {
        anyhow::bail!("HTTP {} fetching {}", status, url);
    }
    Ok(resp.bytes().await?.to_vec())
}

/// Downloads `url`, verifies it against the signature at `sig_url`, and only
/// then writes it to `dest`. Refuses to write anything on a verification
/// failure - an update that doesn't verify must never be applied.
async fn download_file(
    client: &reqwest::Client,
    url: &str,
    sig_url: &str,
    dest: &Path,
) -> Result<()> {
    raccoon!("[Update] Downloading {} ...", url);
    let bytes = fetch_bytes(client, url).await?;

    raccoon!("[Update] Downloading signature {} ...", sig_url);
    let sig_bytes = fetch_bytes(client, sig_url).await?;

    verify_update_signature(&bytes, &sig_bytes)
        .map_err(|e| anyhow!("Refusing to apply {}: {}", url, e))?;
    raccoon!("[Update] Signature OK for {}", url);

    std::fs::write(dest, &bytes).map_err(|e| anyhow!("Cannot write {}: {}", dest.display(), e))?;

    // Ensure executables are runnable on Unix.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dest, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| anyhow!("Cannot chmod {}: {}", dest.display(), e))?;
    }

    raccoon!("[Update] Saved {} bytes → {}", bytes.len(), dest.display());
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
    let _ = std::fs::remove_file(&bak); // stale backup - ignore error

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

// ─── Startup cleanup ──────────────────────────────────────────────────────────

/// Removes leftover `.bak` files from a previous self-update.
/// Called at agent startup: the old process has already exited by then,
/// so Windows releases the file handle and deletion succeeds.
pub fn cleanup_stale_artifacts() {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let Some(dir) = exe.parent() else { return };
    let Some(name) = exe.file_name() else { return };

    // <agent>.bak  (e.g. backupr-agent.exe.bak)
    let agent_bak = exe.with_file_name(format!("{}.bak", name.to_string_lossy()));
    if agent_bak.exists() && std::fs::remove_file(&agent_bak).is_ok() {
        raccoon!("[Update] Removed stale backup: {}", agent_bak.display());
    }

    // <tray>.bak  (e.g. tray.exe.bak)
    let tray_bak = dir.join(format!("{}.bak", tray_local_filename()));
    if tray_bak.exists() && std::fs::remove_file(&tray_bak).is_ok() {
        raccoon!("[Update] Removed stale backup: {}", tray_bak.display());
    }

    // Leftover *.new downloads from an interrupted or failed update. A
    // successful update renames these into place, so anything remaining is a
    // partial/aborted download that should not linger.
    for asset in [Some(agent_asset_name()), tray_asset_name()]
        .into_iter()
        .flatten()
    {
        let new_file = dir.join(format!("{}.new", asset));
        if new_file.exists() && std::fs::remove_file(&new_file).is_ok() {
            raccoon!("[Update] Removed stale download: {}", new_file.display());
        }
    }
}

// ─── Self-restart ─────────────────────────────────────────────────────────────

/// Spawns the binary at `exe_path` (already replaced on disk) with the same
/// CLI arguments, then calls `std::process::exit(0)`.
///
/// This function never returns on success.
#[cfg(not(target_os = "windows"))]
fn restart_self(exe_path: &Path) -> Result<()> {
    raccoon!("[Update] Spawning updated process: {}", exe_path.display());
    std::process::Command::new(exe_path)
        .args(std::env::args().skip(1))
        .spawn()
        .map_err(|e| anyhow!("Failed to spawn updated agent: {}", e))?;
    raccoon!("[Update] Update complete - exiting old process.");
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

// ─── Log reading ─────────────────────────────────────────────────────────────

/// Reads all WinSW log files from the agent's directory and returns their
/// combined content, with a header line identifying each file.
pub fn read_agent_logs() -> String {
    let Ok(exe) = std::env::current_exe() else {
        return "Could not resolve agent directory.".to_string();
    };
    let Some(dir) = exe.parent() else {
        return "Could not resolve agent directory.".to_string();
    };

    const LOG_FILES: &[&str] = &["winsw.out.log", "winsw.err.log", "winsw.wrapper.log"];
    let mut out = String::new();

    for name in LOG_FILES {
        let path = dir.join(name);
        out.push_str(&format!("=== {} ===\n", name));
        match std::fs::read_to_string(&path) {
            Ok(content) if content.is_empty() => out.push_str("(empty)\n"),
            Ok(content) => out.push_str(&content),
            Err(e) => out.push_str(&format!("(could not read: {})\n", e)),
        }
        out.push('\n');
    }

    out
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

    raccoon!("[Update] Session info refreshed (v{}).", CURRENT_VERSION);
    Ok(())
}

/// Checks GitHub for a newer release and downloads the new binaries.
///
/// **Windows**: spawns an `apply-update` helper process that stops the WinSW
/// service, swaps the binaries, and restarts the service - then returns so
/// WinSW can stop this process cleanly.
///
/// **Linux**: replaces binaries in-place and restarts the process directly.
///
/// Returns `Ok(())` without doing anything if already on the latest version.
pub async fn run_update() -> Result<()> {
    if UPDATE_IN_PROGRESS.swap(true, Ordering::SeqCst) {
        raccoon!("[Update] Update already in progress - ignoring duplicate request.");
        return Ok(());
    }

    let result = run_update_inner().await;

    // Release the lock on any outcome that didn't actually kick off an update
    // (already up to date, network error, download failure, etc.) so that a
    // future command or retry can proceed.  When an update *is* in flight the
    // process is about to be stopped/restarted, so we intentionally leave the
    // lock set.
    if result.is_err() {
        UPDATE_IN_PROGRESS.store(false, Ordering::SeqCst);
    }

    result
}

async fn run_update_inner() -> Result<()> {
    raccoon!(
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
        raccoon!("[Update] Already up to date (v{}).", CURRENT_VERSION);
        UPDATE_IN_PROGRESS.store(false, Ordering::SeqCst);
        return Ok(());
    }

    raccoon!(
        "[Update] New version available: v{} \u{2192} v{}",
        CURRENT_VERSION,
        latest_str
    );

    // 3. Resolve the exe directory (all binaries live alongside the agent).
    let exe_path =
        std::env::current_exe().map_err(|e| anyhow!("Cannot resolve exe path: {}", e))?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| anyhow!("Exe has no parent directory: {}", exe_path.display()))?;

    // Every binary asset must ship with a `<name>.sig` asset in the same
    // release - an asset with no signature is treated as missing, not as
    // "unsigned, apply anyway".
    let find_asset =
        |name: &str| -> Option<&ReleaseAsset> { release.assets.iter().find(|a| a.name == name) };
    let sig_url_for = |name: &str| -> Result<String> {
        find_asset(&format!("{}.sig", name))
            .map(|a| a.browser_download_url.clone())
            .ok_or_else(|| anyhow!("Signature asset '{}.sig' not found in release", name))
    };

    // 4. Download tray asset (Windows only).
    let tray_tmp: Option<PathBuf> = if let Some(asset_name) = tray_asset_name() {
        match find_asset(asset_name) {
            Some(asset) => {
                let sig_url = sig_url_for(asset_name)?;
                let tmp = exe_dir.join(format!("{}.new", asset_name));
                download_file(&client, &asset.browser_download_url, &sig_url, &tmp).await?;
                Some(tmp)
            }
            None => {
                raccoon!(
                    "[Update] Warning: tray asset '{}' not in this release; skipping.",
                    asset_name
                );
                None
            }
        }
    } else {
        None
    };

    // 5. Download agent asset.
    let asset_name = agent_asset_name();
    let agent_asset = find_asset(asset_name).ok_or_else(|| {
        anyhow!(
            "Agent asset '{}' not found in release '{}'",
            asset_name,
            release.tag_name
        )
    })?;
    let agent_sig_url = sig_url_for(asset_name)?;
    let agent_tmp = exe_dir.join(format!("{}.new", asset_name));
    download_file(
        &client,
        &agent_asset.browser_download_url,
        &agent_sig_url,
        &agent_tmp,
    )
    .await?;

    // 6. Platform-specific apply step.
    #[cfg(target_os = "windows")]
    {
        // Spawn an independent helper process that will stop the WinSW service,
        // swap the binaries, then restart the service.  We return here so that
        // WinSW can receive the stop signal and shut us down gracefully instead
        // of killing us abruptly with std::process::exit.
        let mut helper_args = vec![
            "apply-update".to_string(),
            WINSW_SERVICE_NAME.to_string(),
            agent_tmp.to_string_lossy().to_string(),
        ];
        if let Some(ref t) = tray_tmp {
            helper_args.push(t.to_string_lossy().to_string());
        }
        // Break the helper out of the WinSW Job Object so it survives when
        // WinSW terminates the service process tree in response to `sc stop`.
        // CREATE_BREAKAWAY_FROM_JOB = 0x01000000
        // CREATE_NEW_PROCESS_GROUP  = 0x00000200
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x01000000;
        std::process::Command::new(&exe_path)
            .args(&helper_args)
            .creation_flags(CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP)
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn apply-update helper: {}", e))?;
        raccoon!("[Update] Apply-update helper spawned - service will restart shortly.");
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Linux: replace in-place and restart.
        if let Some(ref t) = tray_tmp {
            let tray_path = exe_dir.join(tray_local_filename());
            replace_binary(&tray_path, t)?;
        }
        replace_binary(&exe_path, &agent_tmp)?;
        restart_self(&exe_path)
    }
}

// ─── Apply-update helper (Windows) ───────────────────────────────────────────

/// Entry point for the `apply-update` subcommand.
///
/// This runs as a **separate process** (spawned by `run_update`) so that it
/// can stop the WinSW-managed service, replace the binaries, and start the
/// service again - without being the process that WinSW is tracking.
///
/// `service`   - WinSW service name (e.g. `"backupr-agent"`)
/// `agent_tmp` - path to the downloaded `.new` agent binary
/// `tray_tmp`  - path to the downloaded `.new` tray binary (optional)
pub fn run_apply_update_helper(
    service: &str,
    agent_tmp: &Path,
    tray_tmp: Option<&Path>,
) -> Result<()> {
    raccoon!("[apply-update] Helper starting (service: {}).", service);

    // ── 1. Stop the WinSW service ─────────────────────────────────────────
    // `sc stop` blocks until the service has stopped, so by the time it
    // returns the agent process has exited and its file handles are released.
    raccoon!("[apply-update] Stopping service '{}'...", service);
    let stop_ok = std::process::Command::new("sc")
        .args(["stop", service])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    if stop_ok {
        raccoon!("[apply-update] Service stopped.");
    } else {
        // May already be stopped (e.g. manual run / dev mode) - continue.
        raccoon!("[apply-update] Service stop returned non-zero (may already be stopped).");
    }

    // Extra safety margin for handle release.
    std::thread::sleep(std::time::Duration::from_secs(1));

    // ── 2. Kill tray processes (all logged-in users) ──────────────────────
    raccoon!("[apply-update] Killing tray processes...");
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/IM", tray_local_filename(), "/T"])
        .output();
    std::thread::sleep(std::time::Duration::from_millis(500));

    // ── 3. Replace agent binary ───────────────────────────────────────────
    // current_exe() is this helper process = the OLD backupr-agent.exe.
    // Renaming a running EXE is allowed on Windows (OS holds it by handle).
    let exe_path =
        std::env::current_exe().map_err(|e| anyhow!("Cannot resolve exe path: {}", e))?;
    replace_binary(&exe_path, agent_tmp)?;
    // The helper is still running from the old binary (now .bak).
    // cleanup_stale_artifacts() on the next agent startup will remove it.
    raccoon!("[apply-update] Agent binary replaced.");

    // ── 4. Replace tray binary ────────────────────────────────────────────
    if let Some(tray_tmp_path) = tray_tmp {
        let exe_dir = exe_path
            .parent()
            .ok_or_else(|| anyhow!("Exe has no parent directory"))?;
        let tray_dest = exe_dir.join(tray_local_filename());
        replace_binary(&tray_dest, tray_tmp_path)?;
        // Tray process was killed in step 2, so .bak can be deleted now.
        let tray_bak = exe_dir.join(format!("{}.bak", tray_local_filename()));
        let _ = std::fs::remove_file(&tray_bak);
        raccoon!("[apply-update] Tray binary replaced.");
    }

    // ── 5. Start the service ──────────────────────────────────────────────
    raccoon!("[apply-update] Starting service '{}'...", service);
    let start_out = std::process::Command::new("sc")
        .args(["start", service])
        .output()
        .map_err(|e| anyhow!("Failed to run 'sc start': {}", e))?;
    if start_out.status.success() {
        raccoon!("[apply-update] Service started.");
    } else {
        let msg = String::from_utf8_lossy(&start_out.stdout);
        raccoon!("[apply-update] 'sc start' output: {}", msg.trim());
    }

    raccoon!("[apply-update] Done. Exiting helper.");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Real-world regression check: this signature was produced by
    // `openssl pkeyutl -sign -rawin` against the actual release signing key,
    // over the message below - confirms release.sh's OpenSSL output and
    // ed25519-dalek's verification actually interoperate, not just that the
    // math is self-consistent within Rust.
    const MSG: &[u8] = b"hello world test payload";
    const SIG_HEX: &str = "1228b44424af10d9963a61d52c076bcf3839b8b186828188ddabdb7a566a7bf2ef9bdaddf7d542d3f05e534dbda888b9f76b39530a1e825ce61ada015bb0a80c";

    #[test]
    fn verifies_openssl_produced_signature() {
        let sig = decode_hex(SIG_HEX);
        verify_update_signature(MSG, &sig).expect("openssl-produced signature must verify");
    }

    #[test]
    fn rejects_tampered_payload() {
        let sig = decode_hex(SIG_HEX);
        let mut tampered = MSG.to_vec();
        tampered[0] ^= 0xff;
        assert!(verify_update_signature(&tampered, &sig).is_err());
    }

    #[test]
    fn rejects_garbage_signature() {
        assert!(verify_update_signature(MSG, &[0u8; 64]).is_err());
    }
}
