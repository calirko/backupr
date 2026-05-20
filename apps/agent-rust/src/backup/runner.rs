use anyhow::Result;
use futures_util::StreamExt;
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

                    if let Some(pct) = found_pct {
                        if pct as i16 > last_pct {
                            last_pct = pct as i16;
                            on_pct(pct.min(99));
                        }
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

    if use_password {
        if let Some(pwd) = password {
            args.push(format!("-p{}", pwd));
            args.push("-mhe=on".to_string()); // encrypt headers
        }
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

#[cfg(target_os = "windows")]
async fn create_vss_shadow(volume: &str) -> Option<String> {
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
         (Get-WmiObject Win32_ShadowCopy | Where-Object {{ $_.ID -eq $result.ShadowID }}).DeviceObject"
    );

    println!("[Backup] VSS: spawning powershell for {}...", volume);
    let result = run_powershell(&script).await;
    println!("[Backup] VSS: powershell returned for {}", volume);

    match result {
        Ok(out) if out.starts_with('\\') => Some(out),
        Ok(out) => {
            eprintln!("[Backup] VSS output unexpected: {}", out);
            None
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

async fn stage_files(files: &[String], stage_dir: &Path, _progress_tx: &tokio::sync::mpsc::Sender<String>) -> Result<Vec<PathBuf>> {
    tokio::fs::create_dir_all(stage_dir).await?;
    let mut staged = Vec::new();

    // Windows: create VSS shadows per volume
    #[cfg(target_os = "windows")]
    let volume_to_device = {
        use std::collections::HashMap;
        let mut map: HashMap<String, String> = HashMap::new();
        let mut shadow_devices: Vec<String> = Vec::new();

        let vss_enabled = ConfigManager::load().await
            .map(|c| c.vss_enabled.unwrap_or(true))
            .unwrap_or(true);

        if !vss_enabled {
            println!("[Backup] VSS disabled by config — copying live files");
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
                if let Some(device) = create_vss_shadow(vol).await {
                    println!("[Backup] VSS shadow ready: {}", device);
                    map.insert(vol.clone(), device.clone());
                    shadow_devices.push(device);
                } else {
                    eprintln!(
                        "[Backup] VSS unavailable for {} — copying live files (consistency not guaranteed)",
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
                    copy_dir_all(src_path, &dest).await
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

async fn copy_dir_all(src: &Path, dst: &Path) -> Result<()> {
    tokio::fs::create_dir_all(dst).await?;
    let mut entries = tokio::fs::read_dir(src).await?;

    while let Some(entry) = entries.next_entry().await? {
        let file_type = entry.file_type().await?;
        let dest_path = dst.join(entry.file_name());

        if file_type.is_dir() {
            Box::pin(copy_dir_all(&entry.path(), &dest_path)).await?;
        } else {
            tokio::fs::copy(entry.path(), &dest_path).await?;
        }
    }

    Ok(())
}

// ─── Upload ───────────────────────────────────────────────────────────────────

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

    let file_size = tokio::fs::metadata(archive_path).await?.len();
    println!(
        "[Backup] Uploading archive {} ({}) directly to storage...",
        backup_id,
        format_bytes(file_size)
    );

    let client = reqwest::Client::new();

    // Step 1: get presigned PUT URL from the server
    let prepare_resp = client
        .post(format!("{}/api/agent/upload/prepare", server_url))
        .header("Authorization", format!("Bearer {}", agent_token))
        .json(&serde_json::json!({
            "backup_job_id": job_id,
            "backup_id": backup_id,
            "requires_password": false,
        }))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Upload prepare request failed: {}", e))?;

    if !prepare_resp.status().is_success() {
        let text = prepare_resp.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!("Upload prepare failed: {}", text));
    }

    let prepare: serde_json::Value = prepare_resp.json().await
        .map_err(|e| anyhow::anyhow!("Failed to parse prepare response: {}", e))?;

    let upload_url = prepare["upload_url"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No upload_url in prepare response"))?
        .to_string();
    let blob_key = prepare["blob_key"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No blob_key in prepare response"))?
        .to_string();
    let confirmed_backup_id = prepare["backup_id"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("No backup_id in prepare response"))?
        .to_string();

    // Step 2: PUT file directly to MinIO (streaming, no server memory used)
    // Retry logic: immediate, 5s delay, 15s delay
    let retry_delays = [0u64, 5, 15];
    let mut upload_err: Option<anyhow::Error> = None;

    for (attempt, &delay_secs) in retry_delays.iter().enumerate() {
        if delay_secs > 0 {
            println!(
                "[Backup] Retry attempt {}/3: waiting {} seconds...",
                attempt + 1,
                delay_secs
            );
            tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs)).await;
        }

        let file = tokio::fs::File::open(archive_path).await?;
        let raw_stream = tokio_util::io::ReaderStream::new(file);
        let tx = progress_tx.clone();
        let total = file_size;
        let uploaded = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
        let last_pct = std::sync::Arc::new(std::sync::atomic::AtomicI32::new(-1));
        let uploaded_clone = uploaded.clone();
        let last_pct_clone = last_pct.clone();
        let start = std::time::Instant::now();
        let progress_stream = raw_stream.inspect(move |chunk| {
            if let Ok(bytes) = chunk {
                let done = uploaded_clone.fetch_add(bytes.len() as u64, std::sync::atomic::Ordering::Relaxed) + bytes.len() as u64;
                let pct = if total > 0 { ((done * 100) / total).min(99) as i32 } else { 0 };
                if pct > last_pct_clone.load(std::sync::atomic::Ordering::Relaxed) {
                    last_pct_clone.store(pct, std::sync::atomic::Ordering::Relaxed);
                    let elapsed = start.elapsed().as_secs_f64().max(0.001);
                    let speed = format_bytes((done as f64 / elapsed) as u64);
                    let _ = tx.try_send(format!("Uploading {}% ({}/s)", pct, speed));
                }
            }
        });
        let body = reqwest::Body::wrap_stream(progress_stream);

        match client
            .put(&upload_url)
            .header("Content-Length", file_size.to_string())
            .header("Content-Type", "application/octet-stream")
            .body(body)
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    let _ = progress_tx.try_send("Uploading 100%".to_string());
                    println!("[Backup] Direct upload successful on attempt {}/3", attempt + 1);
                    upload_err = None;
                    break;
                } else {
                    let text = response.text().await.unwrap_or_default();
                    let err = anyhow::anyhow!("Upload failed ({}): {}", status, text);
                    if attempt < retry_delays.len() - 1 {
                        eprintln!(
                            "[Backup] Upload attempt {}/3 failed: {}, retrying...",
                            attempt + 1,
                            err
                        );
                    }
                    upload_err = Some(err);
                }
            }
            Err(e) => {
                let err = anyhow::anyhow!("Upload request failed: {}", e);
                if attempt < retry_delays.len() - 1 {
                    eprintln!(
                        "[Backup] Upload attempt {}/3 failed: {}, retrying...",
                        attempt + 1,
                        err
                    );
                }
                upload_err = Some(err);
            }
        }
    }

    if let Some(err) = upload_err {
        return Err(err);
    }

    // Step 3: tell the server the upload is done so it records it as COMPLETED
    let complete_resp = client
        .post(format!("{}/api/agent/upload/complete", server_url))
        .header("Authorization", format!("Bearer {}", agent_token))
        .json(&serde_json::json!({
            "backup_id": confirmed_backup_id,
            "backup_job_id": job_id,
            "blob_key": blob_key,
            "size_bytes": file_size,
        }))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Upload complete request failed: {}", e))?;

    if !complete_resp.status().is_success() {
        let text = complete_resp.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!("Upload complete failed: {}", text));
    }

    println!("[Backup] Backup {} recorded as completed", confirmed_backup_id);
    Ok(())
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

fn safe_delete_file(path: &Path) {
    std::fs::remove_file(path).ok();
}

fn safe_delete_dir(path: &Path) {
    std::fs::remove_dir_all(path).ok();
}

// ─── Public Entry Point ───────────────────────────────────────────────────────

/// Returns the compressed archive size in bytes on success.
pub async fn run_backup_job(
    job: &crate::BackupJobState,
    progress_tx: tokio::sync::mpsc::Sender<String>,
) -> Result<u64> {
    let tmp_base = std::env::temp_dir().join(format!(
        "backupr_{}_{}",
        job.id,
        chrono::Utc::now().timestamp_millis()
    ));

    let stage_dir = {
        let mut p = tmp_base.clone();
        p.set_extension("stage");
        p
    };

    let archive_path = {
        let mut p = tmp_base.clone();
        p.set_extension("7z");
        p
    };

    let result = async {
        println!(
            "[Backup] Staging {} path(s) to {}...",
            job.files.len(),
            stage_dir.display()
        );

        let staged = stage_files(&job.files, &stage_dir, &progress_tx).await?;

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
        upload_backup_archive(&archive_path, &job.id, &job.job_id, progress_tx.clone())
        .await?;

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
    safe_delete_dir(&stage_dir);
    safe_delete_file(&archive_path);

    result
}
