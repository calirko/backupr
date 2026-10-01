use anyhow::Result;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

use crate::lib::config::ConfigManager;

#[allow(dead_code)]
const PROGRESS_THROTTLE_MS: u64 = 250;

#[allow(dead_code)]
pub struct BackupJobPayload {
    pub id: String,
    pub job_id: String,
    pub files: Vec<String>,
    pub compression_level: u8,
    pub use_password: bool,
    pub password: Option<String>,
}

impl From<&crate::BackupJobState> for BackupJobPayload {
    fn from(state: &crate::BackupJobState) -> Self {
        Self {
            id: state.id.clone(),
            job_id: state.job_id.clone(),
            files: state.files.clone(),
            compression_level: state.compression_level,
            use_password: state.use_password,
            password: state.password.clone(),
        }
    }
}

// ─── 7z Resolution ────────────────────────────────────────────────────────────

fn resolve_7z_binary() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        // Check known install paths first
        let candidates = [
            "C:\\Program Files\\7-Zip\\7z.exe",
            "C:\\Program Files (x86)\\7-Zip\\7z.exe",
        ];
        for c in &candidates {
            if Path::new(c).exists() {
                // SAFETY: We leak a Box<str> to get a &'static str for simplicity.
                // This runs once and the path lives for the program lifetime.
                return Box::leak(c.to_string().into_boxed_str());
            }
        }
        "7z.exe" // Fall back to PATH
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Check known paths
        let candidates = ["/usr/bin/7z", "/usr/local/bin/7z", "/usr/bin/7za"];
        for c in &candidates {
            if Path::new(c).exists() {
                return Box::leak(c.to_string().into_boxed_str());
            }
        }
        "7z" // Fall back to PATH
    }
}

// ─── Format Bytes ─────────────────────────────────────────────────────────────

pub fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".to_string();
    }
    let k = 1024u64;
    let sizes = ["B", "KB", "MB", "GB", "TB"];
    let i = (bytes as f64).log(k as f64).floor() as usize;
    let i = i.min(sizes.len() - 1);
    format!(
        "{:.2} {}",
        bytes as f64 / (k.pow(i as u32) as f64),
        sizes[i]
    )
}

// ─── Compression ──────────────────────────────────────────────────────────────

async fn compress_with_progress<F>(args: Vec<String>, mut on_pct: F) -> Result<()>
where
    F: FnMut(u8) + Send + Clone + 'static,
{
    let binary = resolve_7z_binary();

    let mut child = Command::new(binary)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                anyhow::anyhow!(
                    "7-Zip binary not found on PATH. Install p7zip (Linux) or 7-Zip (Windows)."
                )
            } else {
                anyhow::anyhow!("Failed to spawn 7z: {}", e)
            }
        })?;

    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();

    // Read stdout for progress percentages
    let on_pct_clone = on_pct.clone();
    let stdout_task = tokio::spawn(async move {
        let mut buf = vec![0u8; 256];
        let mut tail = String::new();
        let mut last_pct: i16 = -1;
        let mut on_pct = on_pct_clone;

        loop {
            match stdout.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    let text = tail + &String::from_utf8_lossy(&buf[..n]);
                    // Find all percentage matches
                    let mut found_pct: Option<u8> = None;

                    for m in regex_lite::Regex::new(r"(\d+)%").unwrap().find_iter(&text) {
                        if let Ok(pct) = m.as_str().trim_end_matches('%').parse::<u8>() {
                            found_pct = Some(pct);
                        }
                    }

                    if let Some(pct) = found_pct
                        && pct as i16 > last_pct
                    {
                        last_pct = pct as i16;
                        on_pct(pct.min(99));
                    }

                    // Keep last 20 chars as tail for split-chunk handling
                    let new_tail = text
                        .chars()
                        .rev()
                        .take(20)
                        .collect::<String>()
                        .chars()
                        .rev()
                        .collect();
                    tail = new_tail;
                }
                Err(_) => break,
            }
        }
    });

    // Read stderr for error messages
    let stderr_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        stderr.read_to_end(&mut buf).await.ok();
        String::from_utf8_lossy(&buf).to_string()
    });

    let status = child.wait().await?;
    let _ = stdout_task.await;
    let stderr_output = stderr_task.await.unwrap_or_default();

    if status.success() {
        on_pct(100);
        Ok(())
    } else {
        let code = status.code().unwrap_or(-1);
        let tail: String = stderr_output
            .trim()
            .lines()
            .rev()
            .take(5)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");

        Err(anyhow::anyhow!(
            "7z exited with code {}{}",
            code,
            if tail.is_empty() {
                String::new()
            } else {
                format!("\n{}", tail)
            }
        ))
    }
}

fn build_7z_args(
    archive_path: &str,
    files: &[String],
    level: u8,
    use_password: bool,
    password: &Option<String>,
) -> Vec<String> {
    println!("[Backup] Compression: level={}, threads=auto", level);

    let mut args = vec![
        "a".to_string(),
        "-t7z".to_string(),
        "-y".to_string(),
        "-bso0".to_string(), // suppress normal output
        "-bsp1".to_string(), // progress → stdout
        "-bse2".to_string(), // errors → stderr
        format!("-mx={}", level),
        "-mmt=on".to_string(), // auto thread count
        archive_path.to_string(),
    ];

    args.extend(files.iter().cloned());

    if use_password && let Some(pwd) = password {
        args.push(format!("-p{}", pwd));
        args.push("-mhe=on".to_string()); // encrypt headers
    }

    args
}

// ─── VSS (Windows Volume Shadow Copy) ────────────────────────────────────────

#[cfg(target_os = "windows")]
async fn run_powershell(script: &str) -> Result<String> {
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", script])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW);

    let output_future = cmd.output();
    let output = tokio::time::timeout(std::time::Duration::from_secs(60), output_future)
        .await
        .map_err(|_| anyhow::anyhow!("PowerShell timed out after 60 seconds"))??;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(anyhow::anyhow!("{}", stderr))
    }
}

// Windows only allows one ClientAccessible-context shadow copy per volume at
// a time: calling Create() while one already exists just hands back the ID
// of the *existing* (potentially stale) shadow instead of making a new one.
// So if a previous job's shadow was never cleaned up (agent killed by AV/EDR,
// crash, etc.), the next backup would silently be taken from old data. We
// return the ShadowID alongside the DeviceObject so the caller can persist it
// in the lockfile and explicitly delete that exact shadow on next startup if
// the job never finished, see `delete_vss_shadow_by_id`.
#[cfg(target_os = "windows")]
async fn create_vss_shadow(volume: &str) -> Option<(String, String)> {
    // FIX 1: Ensure volume ends with a backslash (WMI requirement)
    let mut normalized_volume = volume.replace('\'', "''");
    if !normalized_volume.ends_with('\\') {
        normalized_volume.push('\\');
    }

    let script = format!(
        "$wmi = [WMICLASS]\"root\\cimv2:win32_shadowcopy\"; \
         $params = $wmi.GetMethodParameters('Create'); \
         $params['Volume'] = '{normalized_volume}'; \
         $params['Context'] = 'ClientAccessible'; \
         $result = $wmi.InvokeMethod('Create', $params, $null); \
         if ($result.ReturnValue -ne 0) {{ exit 1 }}; \
         $copy = Get-WmiObject Win32_ShadowCopy | Where-Object {{ $_.ID -eq $result.ShadowID }}; \
         Write-Output $copy.ID; \
         Write-Output $copy.DeviceObject"
    );

    println!("[Backup] VSS: spawning powershell for {}...", volume);
    let result = run_powershell(&script).await;
    println!("[Backup] VSS: powershell returned for {}", volume);

    match result {
        Ok(out) => {
            let mut lines = out.lines();
            match (lines.next(), lines.next()) {
                (Some(id), Some(device)) if device.starts_with('\\') => {
                    Some((id.trim().to_string(), device.trim().to_string()))
                }
                _ => {
                    eprintln!("[Backup] VSS output unexpected: {}", out);
                    None
                }
            }
        }
        Err(e) => {
            eprintln!("[Backup] VSS failed for {}: {}", volume, e);
            None
        }
    }
}

#[cfg(target_os = "windows")]
async fn delete_vss_shadow(device_object: &str) {
    let escaped = device_object.replace('\'', "''");
    // FIX 2: Added -ErrorAction SilentlyContinue and simplified the filter
    let script = format!(
        "$s = Get-WmiObject Win32_ShadowCopy | Where-Object {{ $_.DeviceObject -eq '{escaped}' }}; \
         if ($s) {{ $s.Delete() }}"
    );
    run_powershell(&script).await.ok();
}

/// Deletes a specific shadow copy by its WMI `ID` (GUID), not by volume or
/// context. Used to clean up exactly the shadow this agent created in an
/// interrupted job, without touching any other shadow copies (e.g. System
/// Restore points) that may exist on the same volume.
#[cfg(target_os = "windows")]
pub async fn delete_vss_shadow_by_id(shadow_id: &str) {
    let escaped = shadow_id.replace('\'', "''");
    let script = format!(
        "$s = Get-WmiObject Win32_ShadowCopy | Where-Object {{ $_.ID -eq '{escaped}' }}; \
         if ($s) {{ $s.Delete() }}"
    );
    match run_powershell(&script).await {
        Ok(_) => println!("[Backup] Cleaned up orphaned VSS shadow {}", shadow_id),
        Err(e) => eprintln!(
            "[Backup] Failed to clean up orphaned VSS shadow {}: {}",
            shadow_id, e
        ),
    }
}

#[cfg(not(target_os = "windows"))]
pub async fn delete_vss_shadow_by_id(_shadow_id: &str) {}

#[cfg(target_os = "windows")]
fn shadow_resolve_path(
    file_path: &str,
    volume_to_device: &std::collections::HashMap<String, String>,
) -> String {
    let path = std::path::Path::new(file_path);
    if let Some(root) = path.components().next() {
        let vol = root.as_os_str().to_string_lossy().to_string();
        // Note: 'vol' is usually "C:"

        if let Some(device) = volume_to_device.get(&vol) {
            // FIX 3: Ensure we don't end up with double backslashes (\\?\...\Device\HarddiskVolumeShadowCopy1\\Users)
            // The DeviceObject usually does NOT end in a slash, but the 'relative' path starts with one.
            let relative = &file_path[vol.len()..];
            let trimmed_relative = relative.trim_start_matches('\\');
            return format!("{}\\{}", device, trimmed_relative);
        }
    }
    file_path.to_string()
}

// ─── Staging ──────────────────────────────────────────────────────────────────

async fn stage_files(
    files: &[String],
    stage_dir: &Path,
    _progress_tx: &tokio::sync::mpsc::Sender<String>,
    _backup_id: &str,
    _job_id: &str,
) -> Result<Vec<PathBuf>> {
    tokio::fs::create_dir_all(stage_dir).await?;
    let mut staged = Vec::new();

    // Windows: create VSS shadows per volume
    #[cfg(target_os = "windows")]
    let volume_to_device = {
        use std::collections::HashMap;
        let mut map: HashMap<String, String> = HashMap::new();
        let mut shadow_devices: Vec<String> = Vec::new();

        let vss_enabled = ConfigManager::load()
            .await
            .map(|c| c.vss_enabled.unwrap_or(true))
            .unwrap_or(true);

        if !vss_enabled {
            println!("[Backup] VSS disabled by config - copying live files");
        } else {
            let volumes: std::collections::HashSet<String> = files
                .iter()
                .filter_map(|f| {
                    Path::new(f)
                        .components()
                        .next()
                        .map(|c| c.as_os_str().to_string_lossy().to_string())
                })
                .collect();

            for vol in &volumes {
                let _ = _progress_tx.try_send(format!("Creating VSS snapshot for {}...", vol));
                println!("[Backup] Creating VSS shadow copy for {}...", vol);
                if let Some((shadow_id, device)) = create_vss_shadow(vol).await {
                    println!("[Backup] VSS shadow ready: {}", device);
                    // Persist immediately so that if the agent is killed before
                    // this job finishes, the next startup can find and delete
                    // this exact shadow instead of it lingering and being
                    // silently reused (stale) by the next backup's Create() call.
                    record_shadow_in_lockfile(_backup_id, _job_id, &shadow_id);
                    map.insert(vol.clone(), device.clone());
                    shadow_devices.push(device);
                } else {
                    eprintln!(
                        "[Backup] VSS unavailable for {} - copying live files (consistency not guaranteed)",
                        vol
                    );
                }
            }
        }

        (map, shadow_devices)
    };

    // Perform the actual staging
    for (i, src) in files.iter().enumerate() {
        #[cfg(target_os = "windows")]
        let resolved = shadow_resolve_path(src, &volume_to_device.0);
        #[cfg(not(target_os = "windows"))]
        let resolved = src.clone();

        let via_vss = resolved != *src;
        let src_path = Path::new(&resolved);
        let dest_name = format!(
            "{}_{}",
            i,
            Path::new(src)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
        );
        let dest = stage_dir.join(&dest_name);

        match tokio::fs::metadata(src_path).await {
            Ok(meta) => {
                let result = if meta.is_dir() {
                    copy_dir_all(src_path, &dest).await.map(|skipped| {
                        if skipped > 0 {
                            eprintln!(
                                "[Backup] {} entr{} under {} could not be read and were skipped",
                                skipped,
                                if skipped == 1 { "y" } else { "ies" },
                                src
                            );
                        }
                    })
                } else {
                    tokio::fs::copy(src_path, &dest)
                        .await
                        .map(|_| ())
                        .map_err(anyhow::Error::new)
                };

                match result {
                    Ok(_) => {
                        staged.push(dest.clone());
                        println!(
                            "[Backup] Staged: {} → {}{}",
                            src,
                            dest.display(),
                            if via_vss { " (VSS snapshot)" } else { "" }
                        );
                    }
                    Err(e) => {
                        eprintln!("[Backup] Could not stage {}: {}", src, e);
                    }
                }
            }
            Err(e) => {
                eprintln!("[Backup] Could not stat {}: {}", src, e);
            }
        }
    }

    // Windows: clean up VSS shadows
    #[cfg(target_os = "windows")]
    for device in &volume_to_device.1 {
        println!("[Backup] Releasing VSS shadow: {}", device);
        delete_vss_shadow(device).await;
    }

    Ok(staged)
}

/// Copies the tree at `src` into `dst` and returns how many entries were
/// skipped. Unreadable entries (locked files, permission errors) are logged and
/// skipped rather than abandoning the whole tree: one locked file must not drop
/// an entire directory from the backup. Symlinked directories are skipped too,
/// since following them can loop forever or escape the selected folder.
async fn copy_dir_all(src: &Path, dst: &Path) -> Result<u64> {
    tokio::fs::create_dir_all(dst).await?;
    // The root must be readable; below it, failures are per entry.
    let mut pending = vec![(tokio::fs::read_dir(src).await?, dst.to_path_buf())];
    let mut skipped = 0u64;

    while let Some((mut entries, dst_dir)) = pending.pop() {
        loop {
            let entry = match entries.next_entry().await {
                Ok(Some(entry)) => entry,
                Ok(None) => break,
                Err(e) => {
                    eprintln!("[Backup] Skipping rest of a directory under {}: {}", dst_dir.display(), e);
                    skipped += 1;
                    break;
                }
            };
            let src_path = entry.path();
            let dest_path = dst_dir.join(entry.file_name());

            let file_type = match entry.file_type().await {
                Ok(t) => t,
                Err(e) => {
                    eprintln!("[Backup] Skipping {}: {}", src_path.display(), e);
                    skipped += 1;
                    continue;
                }
            };

            if file_type.is_dir() {
                let sub = match tokio::fs::create_dir_all(&dest_path).await {
                    Ok(()) => tokio::fs::read_dir(&src_path).await,
                    Err(e) => Err(e),
                };
                match sub {
                    Ok(sub_entries) => pending.push((sub_entries, dest_path)),
                    Err(e) => {
                        eprintln!("[Backup] Skipping directory {}: {}", src_path.display(), e);
                        skipped += 1;
                    }
                }
                continue;
            }

            if file_type.is_symlink() {
                let points_to_file = tokio::fs::metadata(&src_path)
                    .await
                    .map(|m| m.is_file())
                    .unwrap_or(false);
                if !points_to_file {
                    eprintln!(
                        "[Backup] Skipping symlink {} (not a regular file)",
                        src_path.display()
                    );
                    skipped += 1;
                    continue;
                }
            }

            if let Err(e) = tokio::fs::copy(&src_path, &dest_path).await {
                eprintln!("[Backup] Skipping {}: {}", src_path.display(), e);
                skipped += 1;
            }
        }
    }

    Ok(skipped)
}

// ─── Retry ────────────────────────────────────────────────────────────────────
// Agents run on flaky office networks: router DNS that drops lookups, links
// that reset mid-upload, a server restarting behind the proxy. Every upload
// step is idempotent server-side (prepare reuses the backup_id, the PUT
// overwrites the same key, complete just updates the record), so retrying
// is always safe - the only question is whether it can help.

/// Why a request failed, which decides how (and whether) to retry it.
enum Failure {
    /// The hostname did not resolve: the network or the DNS server is down.
    /// Waiting for DNS to come back beats burning attempts on backoff.
    Offline(anyhow::Error),
    /// Timeouts, resets, refused connections, 408/429/5xx: worth another try,
    /// optionally after the delay the server asked for (Retry-After).
    Transient(anyhow::Error, Option<std::time::Duration>),
    /// Anything retrying cannot fix (auth, validation, missing job).
    Permanent(anyhow::Error),
}

struct RetryPolicy {
    max_attempts: u32,
    base_delay: std::time::Duration,
    max_delay: std::time::Duration,
    /// How long one step may wait for DNS to recover before giving up. Time
    /// spent offline does not use up attempts.
    offline_budget: std::time::Duration,
}

/// Small JSON calls to our own API: cheap to repeat, so retry often.
const API_RETRY: RetryPolicy = RetryPolicy {
    max_attempts: 8,
    base_delay: std::time::Duration::from_secs(2),
    max_delay: std::time::Duration::from_secs(60),
    offline_budget: std::time::Duration::from_secs(15 * 60),
};

/// The archive PUT restarts from byte 0 each time, so space attempts out more.
const UPLOAD_RETRY: RetryPolicy = RetryPolicy {
    max_attempts: 5,
    base_delay: std::time::Duration::from_secs(10),
    max_delay: std::time::Duration::from_secs(120),
    offline_budget: std::time::Duration::from_secs(15 * 60),
};

impl RetryPolicy {
    /// Exponential backoff with "equal jitter": half fixed, half random, so a
    /// fleet of agents knocked offline together doesn't come back in lockstep.
    fn backoff(&self, attempt: u32) -> std::time::Duration {
        let exp = self.base_delay.saturating_mul(1u32 << attempt.min(16));
        let capped = exp.min(self.max_delay).as_millis() as u64;
        let half = capped / 2;
        std::time::Duration::from_millis(half + rand::random::<u64>() % (half + 1))
    }
}

/// Windows reports DNS failures as WSAHOST_NOT_FOUND (11001) / WSATRY_AGAIN
/// (11002); elsewhere they only show up in the message text.
fn is_dns_error(err: &(dyn std::error::Error + 'static)) -> bool {
    let mut cur = Some(err);
    while let Some(e) = cur {
        if let Some(io) = e.downcast_ref::<std::io::Error>()
            && matches!(io.raw_os_error(), Some(11001) | Some(11002))
        {
            return true;
        }
        let msg = e.to_string();
        if msg.contains("dns error") || msg.contains("failed to lookup address") {
            return true;
        }
        cur = e.source();
    }
    false
}

fn classify_send_error(context: &str, e: reqwest::Error) -> Failure {
    // Presigned URLs carry credentials in the query string; keep them out of logs.
    let e = e.without_url();
    if is_dns_error(&e) {
        Failure::Offline(anyhow::anyhow!("{}: {}", context, e))
    } else if e.is_builder() {
        Failure::Permanent(anyhow::anyhow!("{}: {}", context, e))
    } else {
        Failure::Transient(anyhow::anyhow!("{}: {}", context, e), None)
    }
}

/// Turns a non-success response into a Failure. `expired_url_ok` marks 403 as
/// retryable for presigned PUTs, where it means the URL expired and the next
/// attempt will fetch a fresh one.
async fn classify_status(
    context: &str,
    resp: reqwest::Response,
    expired_url_ok: bool,
) -> Failure {
    let status = resp.status();
    let retry_after = resp
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse::<u64>().ok())
        .map(|s| std::time::Duration::from_secs(s.min(300)));
    let text = resp.text().await.unwrap_or_default();
    let err = anyhow::anyhow!("{} ({}): {}", context, status, text.trim());
    let retryable = status.is_server_error()
        || matches!(status.as_u16(), 408 | 425 | 429)
        || (expired_url_ok && status.as_u16() == 403);
    if retryable {
        Failure::Transient(err, retry_after)
    } else {
        Failure::Permanent(err)
    }
}

/// Polls the system resolver until `host` resolves or `budget` runs out.
/// Returns how long it waited and whether DNS came back.
async fn wait_for_dns(
    host: &str,
    budget: std::time::Duration,
    progress_tx: &tokio::sync::mpsc::Sender<String>,
) -> (std::time::Duration, bool) {
    let start = std::time::Instant::now();
    let target = format!("{}:443", host);
    loop {
        let probe = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            tokio::net::lookup_host(target.as_str()),
        )
        .await;
        if matches!(probe, Ok(Ok(_))) {
            return (start.elapsed(), true);
        }
        if start.elapsed() >= budget {
            return (start.elapsed(), false);
        }
        let _ = progress_tx.try_send(format!(
            "Network unavailable (cannot resolve {}), waiting {}s...",
            host,
            start.elapsed().as_secs()
        ));
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
}

/// Retry state for one step. Call sites loop on the request and hand every
/// failure to `wait`, which sleeps as appropriate or returns the final error.
struct Retry<'a> {
    what: &'a str,
    host: &'a str,
    policy: &'a RetryPolicy,
    progress_tx: &'a tokio::sync::mpsc::Sender<String>,
    attempt: u32,
    offline_left: std::time::Duration,
}

impl<'a> Retry<'a> {
    fn new(
        what: &'a str,
        host: &'a str,
        policy: &'a RetryPolicy,
        progress_tx: &'a tokio::sync::mpsc::Sender<String>,
    ) -> Self {
        Self {
            what,
            host,
            policy,
            progress_tx,
            attempt: 0,
            offline_left: policy.offline_budget,
        }
    }

    /// True once this step has failed at least once (e.g. to refresh state).
    fn is_retry(&self) -> bool {
        self.attempt > 0 || self.offline_left < self.policy.offline_budget
    }

    async fn wait(&mut self, failure: Failure) -> Result<()> {
        match failure {
            Failure::Permanent(e) => Err(e),
            Failure::Offline(e) => {
                eprintln!("[Backup] {} failed, network looks down: {}", self.what, e);
                let (waited, back) =
                    wait_for_dns(self.host, self.offline_left, self.progress_tx).await;
                // Always shrink the budget so is_retry() sees this, even if the
                // resolver answered on the first probe.
                self.offline_left = self
                    .offline_left
                    .saturating_sub(waited.max(std::time::Duration::from_millis(1)));
                if !back {
                    return Err(e.context(format!(
                        "{} gave up: {} did not resolve for {} min",
                        self.what,
                        self.host,
                        self.policy.offline_budget.as_secs() / 60
                    )));
                }
                println!(
                    "[Backup] DNS for {} answered after {}s, retrying {}",
                    self.host,
                    waited.as_secs(),
                    self.what
                );
                // DNS outages don't use up attempts: the request never left.
                Ok(())
            }
            Failure::Transient(e, retry_after) => {
                self.attempt += 1;
                let max = self.policy.max_attempts;
                if self.attempt >= max {
                    return Err(e.context(format!("{} failed after {} attempts", self.what, max)));
                }
                let delay = retry_after.unwrap_or_else(|| self.policy.backoff(self.attempt - 1));
                eprintln!(
                    "[Backup] {} attempt {}/{} failed: {}, retrying in {}s...",
                    self.what,
                    self.attempt,
                    max,
                    e,
                    delay.as_secs()
                );
                let _ = self.progress_tx.try_send(format!(
                    "{} failed, retrying in {}s (attempt {}/{})",
                    self.what,
                    delay.as_secs(),
                    self.attempt + 1,
                    max
                ));
                tokio::time::sleep(delay).await;
                Ok(())
            }
        }
    }
}

// ─── Upload ───────────────────────────────────────────────────────────────────

struct PreparedUpload {
    upload_url: String,
    blob_key: String,
    backup_id: String,
}

async fn prepare_upload(
    client: &reqwest::Client,
    server_url: &str,
    agent_token: &str,
    job_id: &str,
    backup_id: &str,
) -> std::result::Result<PreparedUpload, Failure> {
    let resp = client
        .post(format!("{}/api/agent/upload/prepare", server_url))
        .timeout(std::time::Duration::from_secs(60))
        .header("Authorization", format!("Bearer {}", agent_token))
        .json(&serde_json::json!({
            "backup_job_id": job_id,
            "backup_id": backup_id,
            "requires_password": false,
        }))
        .send()
        .await
        .map_err(|e| classify_send_error("Upload prepare request failed", e))?;

    if !resp.status().is_success() {
        return Err(classify_status("Upload prepare failed", resp, false).await);
    }

    let prepare: serde_json::Value = resp.json().await.map_err(|e| {
        Failure::Transient(
            anyhow::anyhow!("Failed to parse prepare response: {}", e),
            None,
        )
    })?;

    let field = |name: &str| {
        prepare[name].as_str().map(str::to_string).ok_or_else(|| {
            Failure::Permanent(anyhow::anyhow!("No {} in prepare response", name))
        })
    };
    Ok(PreparedUpload {
        upload_url: field("upload_url")?,
        blob_key: field("blob_key")?,
        backup_id: field("backup_id")?,
    })
}

async fn upload_backup_archive(
    archive_path: &Path,
    backup_id: &str,
    job_id: &str,
    progress_tx: tokio::sync::mpsc::Sender<String>,
) -> Result<()> {
    let config = ConfigManager::load().await?;

    let server_url = config
        .server_url
        .ok_or_else(|| anyhow::anyhow!("Agent not configured (missing serverUrl)"))?;
    let agent_token = config
        .agent_token
        .ok_or_else(|| anyhow::anyhow!("Agent not configured (missing agentToken)"))?;
    let host = reqwest::Url::parse(&server_url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .ok_or_else(|| anyhow::anyhow!("Invalid serverUrl: {}", server_url))?;

    let file_size = tokio::fs::metadata(archive_path).await?.len();
    println!(
        "[Backup] Uploading archive {} ({}) directly to storage...",
        backup_id,
        format_bytes(file_size)
    );

    // No overall timeout (a large upload can legitimately take hours), but a
    // dead server or network must not hang the job - and with it the whole
    // queue - forever.
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .tcp_keepalive(std::time::Duration::from_secs(60))
        .build()?;

    // Step 1: get presigned PUT URL from the server
    let mut retry = Retry::new("Upload prepare", &host, &API_RETRY, &progress_tx);
    let mut prepared = loop {
        match prepare_upload(&client, &server_url, &agent_token, job_id, backup_id).await {
            Ok(p) => break p,
            Err(f) => retry.wait(f).await?,
        }
    };

    // Step 2: PUT file directly to MinIO (streaming, no server memory used).
    // The presigned URL lives for an hour, so every retry fetches a fresh one
    // (prepare is idempotent) rather than risk a 403 on an expired URL.
    let storage_host = reqwest::Url::parse(&prepared.upload_url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_else(|| host.clone());

    let mut retry = Retry::new("Upload", &storage_host, &UPLOAD_RETRY, &progress_tx);
    loop {
        if retry.is_retry() {
            // Refresh the URL; a failure here counts against this step's retries.
            match prepare_upload(&client, &server_url, &agent_token, job_id, backup_id).await {
                Ok(p) => prepared = p,
                Err(f) => {
                    retry.wait(f).await?;
                    continue;
                }
            }
        }
        match put_archive(&client, &prepared.upload_url, archive_path, file_size, &progress_tx)
            .await
        {
            Ok(()) => break,
            Err(f) => retry.wait(f).await?,
        }
    }
    println!("[Backup] Direct upload successful");

    // Step 3: tell the server the upload is done so it records it as COMPLETED
    let mut retry = Retry::new("Upload complete", &host, &API_RETRY, &progress_tx);
    loop {
        match complete_upload(&client, &server_url, &agent_token, job_id, &prepared, file_size)
            .await
        {
            Ok(()) => break,
            Err(f) => retry.wait(f).await?,
        }
    }

    println!(
        "[Backup] Backup {} recorded as completed",
        prepared.backup_id
    );
    Ok(())
}

/// One streaming PUT of the archive to the presigned storage URL.
async fn put_archive(
    client: &reqwest::Client,
    upload_url: &str,
    archive_path: &Path,
    file_size: u64,
    progress_tx: &tokio::sync::mpsc::Sender<String>,
) -> std::result::Result<(), Failure> {
    let file = tokio::fs::File::open(archive_path)
        .await
        .map_err(|e| Failure::Permanent(anyhow::anyhow!("Cannot open archive: {}", e)))?;
    let raw_stream = tokio_util::io::ReaderStream::new(file);
    let tx = progress_tx.clone();
    let uploaded = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
    let last_pct = std::sync::Arc::new(std::sync::atomic::AtomicI32::new(-1));
    let start = std::time::Instant::now();
    let progress_stream = raw_stream.inspect(move |chunk| {
        if let Ok(bytes) = chunk {
            let done = uploaded
                .fetch_add(bytes.len() as u64, std::sync::atomic::Ordering::Relaxed)
                + bytes.len() as u64;
            let pct = (done * 100).checked_div(file_size).unwrap_or(0).min(99) as i32;
            if pct > last_pct.load(std::sync::atomic::Ordering::Relaxed) {
                last_pct.store(pct, std::sync::atomic::Ordering::Relaxed);
                let elapsed = start.elapsed().as_secs_f64().max(0.001);
                let speed = format_bytes((done as f64 / elapsed) as u64);
                let _ = tx.try_send(format!("Uploading {}% ({}/s)", pct, speed));
            }
        }
    });
    let body = reqwest::Body::wrap_stream(progress_stream);

    let response = client
        .put(upload_url)
        .header("Content-Length", file_size.to_string())
        .header("Content-Type", "application/octet-stream")
        .body(body)
        .send()
        .await
        .map_err(|e| classify_send_error("Upload request failed", e))?;

    if !response.status().is_success() {
        return Err(classify_status("Upload failed", response, true).await);
    }
    let _ = progress_tx.try_send("Uploading 100%".to_string());
    Ok(())
}

async fn complete_upload(
    client: &reqwest::Client,
    server_url: &str,
    agent_token: &str,
    job_id: &str,
    prepared: &PreparedUpload,
    file_size: u64,
) -> std::result::Result<(), Failure> {
    let resp = client
        .post(format!("{}/api/agent/upload/complete", server_url))
        .timeout(std::time::Duration::from_secs(60))
        .header("Authorization", format!("Bearer {}", agent_token))
        .json(&serde_json::json!({
            "backup_id": prepared.backup_id,
            "backup_job_id": job_id,
            "blob_key": prepared.blob_key,
            "size_bytes": file_size,
        }))
        .send()
        .await
        .map_err(|e| classify_send_error("Upload complete request failed", e))?;
    if !resp.status().is_success() {
        return Err(classify_status("Upload complete failed", resp, false).await);
    }
    Ok(())
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

fn safe_delete_dir(path: &Path) {
    std::fs::remove_dir_all(path).ok();
}

// ─── Orphan cleanup ─────────────────────────────────────────────────────────────
// When the agent is killed mid-backup the 7z child process keeps running.
// Call this whenever a stale lockfile is detected to ensure 7z isn't still
// chewing through disk/CPU before we report the failure to the server.

pub fn kill_orphan_7z() {
    #[cfg(target_os = "windows")]
    {
        // /F force-kills, /T terminates the whole process tree.
        match std::process::Command::new("taskkill")
            .args(["/F", "/IM", "7z.exe", "/T"])
            .output()
        {
            Ok(o) if o.status.success() => {
                println!("[Backup] Killed orphaned 7z.exe process(es).");
            }
            _ => {} // nothing running - fine
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // 7z on Linux can be named 7z, 7za, or 7zz depending on the package.
        for name in ["7z", "7za", "7zz"] {
            if let Ok(out) = std::process::Command::new("pkill")
                .args(["-x", name])
                .output()
                && out.status.success()
            {
                println!("[Backup] Killed orphaned {} process(es).", name);
            }
        }
    }
}

// ─── Lockfile ─────────────────────────────────────────────────────────────────
// Written when a backup job starts; removed when it ends. If the agent is
// killed mid-job the file remains, and on the next startup the agent reads it
// to report the interrupted backup to the server.

#[derive(Debug, Serialize, Deserialize)]
pub struct LockfileData {
    pub backup_id: String,
    pub job_id: String,
    /// WMI ShadowIDs of any VSS shadow copies created for this job so far.
    /// If the agent is killed mid-job, these are the exact shadows that must
    /// be deleted on next startup, otherwise Windows will silently hand the
    /// same (stale) shadow back on the next Create() call for that volume.
    #[serde(default)]
    pub shadow_ids: Vec<String>,
}

fn lockfile_path() -> PathBuf {
    // Store next to the executable so it survives reboots, just like backupr.conf.
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("backupr_job.lock")))
        .unwrap_or_else(|| PathBuf::from("backupr_job.lock"))
}

fn write_lockfile(backup_id: &str, job_id: &str) {
    let data = LockfileData {
        backup_id: backup_id.to_string(),
        job_id: job_id.to_string(),
        shadow_ids: Vec::new(),
    };
    if let Ok(json) = serde_json::to_string(&data)
        && let Err(e) = std::fs::write(lockfile_path(), json)
    {
        eprintln!("[Backup] Warning: could not write lockfile: {}", e);
    }
}

/// Appends a newly-created VSS shadow's ID to the current job's lockfile, so
/// it can be cleaned up on next startup if the agent doesn't get to finish
/// (and delete it normally) itself.
#[allow(dead_code)]
fn record_shadow_in_lockfile(backup_id: &str, job_id: &str, shadow_id: &str) {
    let path = lockfile_path();
    let mut data = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<LockfileData>(&raw).ok())
        .unwrap_or_else(|| LockfileData {
            backup_id: backup_id.to_string(),
            job_id: job_id.to_string(),
            shadow_ids: Vec::new(),
        });
    data.shadow_ids.push(shadow_id.to_string());
    if let Ok(json) = serde_json::to_string(&data)
        && let Err(e) = std::fs::write(&path, json)
    {
        eprintln!("[Backup] Warning: could not update lockfile with shadow id: {}", e);
    }
}

pub fn remove_lockfile() {
    std::fs::remove_file(lockfile_path()).ok();
}

/// Returns `Some(data)` if a stale lockfile from a previous interrupted backup
/// exists, or `None` if the agent exited cleanly last time.
pub fn read_stale_lockfile() -> Option<LockfileData> {
    let path = lockfile_path();
    if !path.exists() {
        return None;
    }
    let raw = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&raw).ok()
}

// ─── Work directory ───────────────────────────────────────────────────────────

/// Creates a fresh, randomly named directory for one backup's staged copies
/// and archive. The temp dir is shared (e.g. /tmp), and the agent usually runs
/// as root/SYSTEM: a predictable path would let another local user pre-create
/// it to read the staged files, or plant a symlink where the archive is
/// written. `create_dir` (not `_all`) fails if the path already exists.
fn create_private_work_dir(backup_id: &str) -> Result<PathBuf> {
    // The id comes from the server; keep it to a safe, short file name part.
    let safe_id: String = backup_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(64)
        .collect();
    let base = std::env::temp_dir();

    for _ in 0..8 {
        let dir = base.join(format!("backupr_{}_{:016x}", safe_id, rand::random::<u64>()));
        #[cfg_attr(not(unix), allow(unused_mut))]
        let mut builder = std::fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        match builder.create(&dir) {
            Ok(()) => return Ok(dir),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => {
                return Err(anyhow::anyhow!(
                    "Cannot create work directory in {}: {}",
                    base.display(),
                    e
                ));
            }
        }
    }
    Err(anyhow::anyhow!("Cannot create a unique work directory in {}", base.display()))
}

// ─── Public Entry Point ───────────────────────────────────────────────────────

/// Returns the compressed archive size in bytes on success.
pub async fn run_backup_job(
    job: &crate::BackupJobState,
    progress_tx: tokio::sync::mpsc::Sender<String>,
) -> Result<u64> {
    let work_dir = create_private_work_dir(&job.id)?;
    let stage_dir = work_dir.join("stage");
    let archive_path = work_dir.join("backup.7z");

    write_lockfile(&job.id, &job.job_id);
    println!("[Backup] Lockfile written for backup {}", job.id);

    let result = async {
        println!(
            "[Backup] Staging {} path(s) to {}...",
            job.files.len(),
            stage_dir.display()
        );

        let staged = stage_files(&job.files, &stage_dir, &progress_tx, &job.id, &job.job_id).await?;

        if staged.is_empty() {
            anyhow::bail!("No files could be staged for backup.");
        }

        let level = job.compression_level.clamp(1, 9);
        let staged_strs: Vec<String> = staged
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();

        let args = build_7z_args(
            &archive_path.to_string_lossy(),
            &staged_strs,
            level,
            job.use_password,
            &job.password,
        );

        let start_compress = std::time::Instant::now();
        println!("[Backup] Starting compression (level {})...", level);

        let compress_tx = progress_tx.clone();
        compress_with_progress(args, move |pct| {
            let _ = compress_tx.try_send(format!("Compressing {}%", pct));
            println!("[Backup] Compressing {}%...", pct);
        })
        .await?;

        safe_delete_dir(&stage_dir);

        let archive_size = std::fs::metadata(&archive_path)?.len();
        let compress_sec = start_compress.elapsed().as_secs_f64();
        println!(
            "[Backup] Compression complete: {} in {:.1}s ({}/s)",
            format_bytes(archive_size),
            compress_sec,
            format_bytes((archive_size as f64 / compress_sec) as u64)
        );

        let _ = progress_tx.try_send("Uploading 0%".to_string());
        let start_upload = std::time::Instant::now();
        upload_backup_archive(&archive_path, &job.id, &job.job_id, progress_tx.clone()).await?;

        let upload_sec = start_upload.elapsed().as_secs_f64();
        println!(
            "[Backup] Upload complete in {:.1}s ({}/s)",
            upload_sec,
            format_bytes((archive_size as f64 / upload_sec) as u64)
        );

        Ok(archive_size)
    }
    .await;

    // Always clean up
    safe_delete_dir(&work_dir);
    remove_lockfile();

    result
}

#[cfg(test)]
mod retry_tests {
    use super::*;

    #[test]
    fn backoff_grows_and_stays_capped() {
        for attempt in 0..20 {
            let d = API_RETRY.backoff(attempt);
            let ceiling = API_RETRY
                .base_delay
                .saturating_mul(1u32 << attempt.min(16))
                .min(API_RETRY.max_delay);
            assert!(d <= ceiling, "attempt {attempt}: {d:?} > {ceiling:?}");
            assert!(d >= ceiling / 2, "attempt {attempt}: {d:?} < half of {ceiling:?}");
        }
    }

    #[test]
    fn detects_windows_dns_errors() {
        let wsa = std::io::Error::from_raw_os_error(11001);
        assert!(is_dns_error(&wsa));
        let hyper_style = std::io::Error::other("dns error: failed to lookup address information");
        assert!(is_dns_error(&hyper_style));
        let reset = std::io::Error::from(std::io::ErrorKind::ConnectionReset);
        assert!(!is_dns_error(&reset));
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[tokio::test]
    async fn copy_skips_unreadable_files_and_symlink_loops() {
        let root = create_private_work_dir("test").unwrap();
        let src = root.join("src");
        std::fs::create_dir_all(src.join("sub")).unwrap();
        std::fs::write(src.join("ok.txt"), "ok").unwrap();
        std::fs::write(src.join("sub/nested.txt"), "nested").unwrap();
        std::fs::write(src.join("locked.txt"), "secret").unwrap();
        std::fs::set_permissions(src.join("locked.txt"), std::fs::Permissions::from_mode(0o000))
            .unwrap();
        std::os::unix::fs::symlink(&src, src.join("sub/loop")).unwrap();
        std::os::unix::fs::symlink(src.join("ok.txt"), src.join("link.txt")).unwrap();

        let dst = root.join("dst");
        let skipped = copy_dir_all(&src, &dst).await.unwrap();

        assert_eq!(std::fs::read_to_string(dst.join("ok.txt")).unwrap(), "ok");
        assert_eq!(std::fs::read_to_string(dst.join("sub/nested.txt")).unwrap(), "nested");
        assert_eq!(std::fs::read_to_string(dst.join("link.txt")).unwrap(), "ok");
        assert!(!dst.join("sub/loop").exists(), "directory symlink must not be followed");
        // loop symlink always skipped; the locked file too unless running as root
        let running_as_root = std::fs::read(src.join("locked.txt")).is_ok();
        assert_eq!(skipped, if running_as_root { 1 } else { 2 });

        std::fs::set_permissions(src.join("locked.txt"), std::fs::Permissions::from_mode(0o600))
            .unwrap();
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn work_dir_is_private_and_unique() {
        let a = create_private_work_dir("../../etc/evil").unwrap();
        let b = create_private_work_dir("../../etc/evil").unwrap();
        assert_ne!(a, b);
        assert_eq!(a.parent().unwrap(), std::env::temp_dir());
        let mode = std::fs::metadata(&a).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o700);
        std::fs::remove_dir(&a).unwrap();
        std::fs::remove_dir(&b).unwrap();
    }
}
