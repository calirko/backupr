#![allow(special_module_name)]

mod backup;
mod ipc;
mod ipc_server;
mod lib;
mod notifications;
mod setup;

use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use ipc::StatusState;
use lib::config::{AgentConfig, ConfigManager};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::env;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::{interval, sleep};
use tokio_tungstenite::{connect_async, tungstenite::Message};

const RECONNECT_TIMEOUT_MS: u64 = 5000;
const MAX_RECONNECT_TIMEOUT_MS: u64 = 30000;
const HEARTBEAT_INTERVAL_MS: u64 = 30000;
const STATUS_REPORT_INTERVAL_MS: u64 = 15000;

static IPC: std::sync::OnceLock<std::sync::Arc<ipc_server::IpcHandle>> =
    std::sync::OnceLock::new();


fn parse_pct_from_msg(s: &str) -> Option<f32> {
    s.split_whitespace()
        .find(|t| t.ends_with('%'))
        .and_then(|t| t.trim_end_matches('%').parse::<f32>().ok())
        .map(|p| (p / 100.0).clamp(0.0, 1.0))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum JobStatus {
    Queued,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupJobState {
    id: String,
    job_id: String,
    status: JobStatus,
    files: Vec<String>,
    compression_level: u8,
    use_password: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    completed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status_message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct BackupJobPayload {
    id: String,
    #[serde(rename = "jobId")]
    job_id: String,
    #[serde(rename = "jobName")]
    job_name: String,
    files: Vec<String>,
    compression_level: u8,
    use_password: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    password: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
#[allow(non_snake_case)]
enum ServerMessage {
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "pong")]
    Pong,
    #[serde(rename = "connected")]
    Connected { sessionId: String },
    #[serde(rename = "start_backup")]
    StartBackup { backupJob: BackupJobPayload },
    #[serde(rename = "dry_run")]
    DryRun {
        requestId: String,
        files: Vec<String>,
        compression_level: u8,
    },
    #[serde(rename = "error")]
    Error { message: String },
}

struct BackuprAgent {
    config: AgentConfig,
    job_queue: Arc<Mutex<VecDeque<BackupJobState>>>,
    current_job: Arc<Mutex<Option<BackupJobState>>>,
    shutdown: Arc<tokio::sync::broadcast::Sender<()>>,
}

impl BackuprAgent {
    async fn new() -> Result<Self> {
        let config = ConfigManager::load().await?;

        if config.agent_token.is_none() || config.server_url.is_none() {
            eprintln!(
                "\x1b[31m[Error] Agent is not configured. Run: agent setup <agentCode>\x1b[0m"
            );
            std::process::exit(1);
        }

        let (shutdown, _) = tokio::sync::broadcast::channel(10);
        let _ = IPC.set(std::sync::Arc::new(ipc_server::IpcHandle::new()));

        Ok(Self {
            config,
            job_queue: Arc::new(Mutex::new(VecDeque::new())),
            current_job: Arc::new(Mutex::new(None)),
            shutdown: Arc::new(shutdown),
        })
    }

    async fn start(&self) -> Result<()> {
        let mut reconnect_attempts = 0u32;

        // Graceful shutdown handler
        let shutdown_tx = self.shutdown.clone();
        tokio::spawn(async move {
            tokio::signal::ctrl_c().await.ok();
            println!("\n[Agent] Shutting down gracefully...");
            let _ = shutdown_tx.send(());
        });

        // Also handle SIGTERM (Unix-only)
        #[cfg(unix)]
        {
            let shutdown_tx2 = self.shutdown.clone();
            tokio::spawn(async move {
                use tokio::signal::unix::{SignalKind, signal};
                let mut sigterm =
                    signal(SignalKind::terminate()).expect("Failed to register SIGTERM handler");
                sigterm.recv().await;
                println!("\n[Agent] Received SIGTERM, shutting down...");
                let _ = shutdown_tx2.send(());
            });
        }

        let mut shutdown_rx = self.shutdown.subscribe();

        if let Some(ipc) = IPC.get() {
            let ipc = ipc.clone();
            tokio::spawn(ipc_server::run_ipc_server(ipc));
        }

        loop {
            tokio::select! {
                result = self.connect() => {
                    match result {
                        Ok(_) => {
                            reconnect_attempts = 0;
                        }
                        Err(e) => {
                            eprintln!("[Agent] Connection error: {}", e);
                        }
                    }
                }
                _ = shutdown_rx.recv() => {
                    println!("[Agent] Received shutdown signal");
                    break;
                }
            }

            // Check if we should exit
            if shutdown_rx.is_closed() {
                break;
            }

            // Exponential backoff with jitter
            let backoff_ms = (RECONNECT_TIMEOUT_MS as f64 * 1.5_f64.powi(reconnect_attempts as i32))
                .min(MAX_RECONNECT_TIMEOUT_MS as f64) as u64;
            let jitter_ms = rand::random::<u64>() % 1000;
            let delay_ms = backoff_ms + jitter_ms;

            println!(
                "[Agent] Reconnecting in {}ms (attempt {})...",
                delay_ms,
                reconnect_attempts + 1
            );
            reconnect_attempts += 1;

            tokio::select! {
                _ = sleep(Duration::from_millis(delay_ms)) => {}
                _ = shutdown_rx.recv() => {
                    println!("[Agent] Received shutdown signal during backoff");
                    break;
                }
            }
        }

        println!("[Agent] Shutdown complete");
        std::process::exit(0);
    }

    async fn connect(&self) -> Result<()> {
        let _shutdown_rx = self.shutdown.subscribe();
        let ws_base = self
            .config
            .ws_url
            .as_ref()
            .or(self.config.server_url.as_ref())
            .unwrap()
            .replace("http://", "ws://")
            .replace("https://", "wss://");

        let ws_url = format!(
            "{}/api/agent/ws?token={}",
            ws_base,
            self.config.agent_token.as_ref().unwrap()
        );

        println!("[Agent] Connecting to {}...", ws_url);

        let (ws_stream, _) = connect_async(&ws_url).await?;
        println!("\x1b[32m[Agent] Connected and authenticated.\x1b[0m");

        let (mut write, mut read) = ws_stream.split();

        // Create a shutdown channel for spawned tasks
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::broadcast::channel::<()>(10);

        // Heartbeat task
        let mut heartbeat_timer = interval(Duration::from_millis(HEARTBEAT_INTERVAL_MS));
        let (heartbeat_tx, mut heartbeat_rx) = tokio::sync::mpsc::channel::<Message>(10);
        let mut shutdown_rx_hb = shutdown_tx.subscribe();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = heartbeat_timer.tick() => {
                        println!("[Agent] Sending heartbeat...");
                        let msg = serde_json::json!({"type": "ping"});
                        if heartbeat_tx
                            .send(Message::Text(msg.to_string()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    _ = shutdown_rx_hb.recv() => {
                        break;
                    }
                }
            }
        });

        // Status reporting task
        let mut status_timer = interval(Duration::from_millis(STATUS_REPORT_INTERVAL_MS));
        let (status_tx, mut status_rx) = tokio::sync::mpsc::channel::<Message>(10);
        let current_job_clone = self.current_job.clone();
        let job_queue_clone = self.job_queue.clone();
        let mut shutdown_rx_status = shutdown_tx.subscribe();

        tokio::spawn(async move {
            // Send immediately on connection
            let status = Self::build_status_report(&current_job_clone, &job_queue_clone).await;
            let _ = status_tx.send(Message::Text(status)).await;

            loop {
                tokio::select! {
                    _ = status_timer.tick() => {
                        let status = Self::build_status_report(&current_job_clone, &job_queue_clone).await;
                        if status_tx.send(Message::Text(status)).await.is_err() {
                            break;
                        }
                        println!("[Agent] Sent status report");
                    }
                    _ = shutdown_rx_status.recv() => {
                        break;
                    }
                }
            }
        });

        // Job processor task
        let mut job_timer = interval(Duration::from_millis(100));
        let (job_tx, mut job_rx) = tokio::sync::mpsc::channel::<()>(10);
        let mut shutdown_rx_job = shutdown_tx.subscribe();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = job_timer.tick() => {
                        let _ = job_tx.send(()).await;
                    }
                    _ = shutdown_rx_job.recv() => {
                        break;
                    }
                }
            }
        });

        // Message handler
        let config_clone = self.config.clone();
        let job_queue_clone = self.job_queue.clone();
        let current_job_clone = self.current_job.clone();
        let (cmd_tx, mut cmd_rx) = tokio::sync::mpsc::channel::<Message>(10);
        let cmd_tx_for_select = cmd_tx.clone();
        let mut shutdown_rx_msg = shutdown_tx.subscribe();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    msg = read.next() => {
                        match msg {
                            Some(Ok(Message::Text(text))) => {
                                if let Err(e) = Self::handle_message(
                                    &text,
                                    &config_clone,
                                    &job_queue_clone,
                                    &current_job_clone,
                                    &cmd_tx,
                                )
                                .await
                                {
                                    eprintln!("[Agent] Error handling message: {}", e);
                                }
                            }
                            Some(Ok(Message::Close(_))) => {
                                println!("[Agent] Connection closed by server");
                                break;
                            }
                            Some(Err(e)) => {
                                eprintln!("[Agent] WebSocket error: {}", e);
                                break;
                            }
                            None => break,
                            _ => {}
                        }
                    }
                    _ = shutdown_rx_msg.recv() => {
                        break;
                    }
                }
            }
        });

        // Multiplex outgoing messages
        loop {
            tokio::select! {
                Some(msg) = heartbeat_rx.recv() => {
                    write.send(msg).await?;
                }
                Some(msg) = status_rx.recv() => {
                    write.send(msg).await?;
                }
                Some(msg) = cmd_rx.recv() => {
                    write.send(msg).await?;
                }
                Some(_) = job_rx.recv() => {
                    Self::process_next_job(&self.job_queue, &self.current_job, &cmd_tx_for_select).await;
                }
                _ = shutdown_rx.recv() => {
                    break;
                }
                else => break,
            }
        }

        // Signal shutdown to all tasks
        let _ = shutdown_tx.send(());

        println!("[Agent] Connection closed");
        Ok(())
    }

    async fn handle_message(
        text: &str,
        _config: &AgentConfig,
        job_queue: &Arc<Mutex<VecDeque<BackupJobState>>>,
        current_job: &Arc<Mutex<Option<BackupJobState>>>,
        cmd_tx: &tokio::sync::mpsc::Sender<Message>,
    ) -> Result<()> {
        let msg: ServerMessage = serde_json::from_str(text)?;

        match msg {
            ServerMessage::Ping => {
                let pong = serde_json::json!({"type": "pong"});
                cmd_tx.send(Message::Text(pong.to_string())).await?;
            }
            ServerMessage::Pong => {
                println!("[Agent] Received pong from server.");
            }
            ServerMessage::Connected { sessionId } => {
                println!(
                    "[Agent] Server acknowledged connection (session: {})",
                    sessionId
                );
            }
            ServerMessage::StartBackup { backupJob } => {
                println!("[Agent] Received start_backup command: {:?}", backupJob);
                let job_state = BackupJobState {
                    id: backupJob.id,
                    job_id: backupJob.job_id,
                    status: JobStatus::Queued,
                    files: backupJob.files,
                    compression_level: backupJob.compression_level,
                    use_password: backupJob.use_password,
                    password: backupJob.password,
                    started_at: None,
                    completed_at: None,
                    error: None,
                    status_message: None,
                };
                Self::queue_backup_job(job_state, job_queue, current_job, cmd_tx).await;
            }
            ServerMessage::DryRun {
                requestId,
                files,
                compression_level,
            } => {
                Self::handle_dry_run(requestId, files, compression_level, cmd_tx).await?;
            }
            ServerMessage::Error { message } => {
                if message == "Invalid token" {
                    eprintln!(
                        "[Agent] The token was invalidated. Clearing config and shutting down."
                    );
                    ConfigManager::clear().await?;
                    std::process::exit(1);
                } else {
                    eprintln!("[Agent] Unknown error message: {}", message);
                }
            }
        }

        Ok(())
    }

    async fn handle_dry_run(
        request_id: String,
        paths: Vec<String>,
        compression_level: u8,
        cmd_tx: &tokio::sync::mpsc::Sender<Message>,
    ) -> Result<()> {
        use std::fs;

        println!(
            "[Agent] Received dry_run request ({}) for {} path(s): {:?}",
            request_id,
            paths.len(),
            paths
        );

        let compression_ratios = [
            (1, 0.7),
            (2, 0.65),
            (3, 0.6),
            (4, 0.55),
            (5, 0.5),
            (6, 0.45),
            (7, 0.4),
            (8, 0.35),
            (9, 0.3),
        ]
        .iter()
        .cloned()
        .collect::<std::collections::HashMap<u8, f64>>();

        let compression_ratio = compression_ratios.get(&compression_level).unwrap_or(&0.5);

        #[derive(Serialize)]
        struct PathResult {
            path: String,
            exists: bool,
            readable: bool,
            #[serde(rename = "type")]
            file_type: String,
            size_bytes: u64,
            #[serde(skip_serializing_if = "Option::is_none")]
            error: Option<String>,
        }

        fn get_dir_size(dir: &std::path::Path) -> u64 {
            let mut total = 0u64;
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    if let Ok(metadata) = entry.metadata() {
                        total += if metadata.is_dir() {
                            get_dir_size(&entry.path())
                        } else {
                            metadata.len()
                        };
                    }
                }
            }
            total
        }

        let mut path_results = Vec::new();
        let mut total_bytes = 0u64;

        for p in &paths {
            let path = std::path::Path::new(p);
            let mut result = PathResult {
                path: p.clone(),
                exists: false,
                readable: false,
                file_type: "unknown".to_string(),
                size_bytes: 0,
                error: None,
            };

            if let Ok(metadata) = fs::metadata(path) {
                result.exists = true;
                result.file_type = if metadata.is_dir() {
                    "directory"
                } else {
                    "file"
                }
                .to_string();

                // Check readability
                if fs::File::open(path).is_ok() || metadata.is_dir() {
                    result.readable = true;
                    result.size_bytes = if metadata.is_dir() {
                        get_dir_size(path)
                    } else {
                        metadata.len()
                    };
                    total_bytes += result.size_bytes;
                } else {
                    result.error = Some("Not readable".to_string());
                }
            } else {
                result.error = Some("Path does not exist".to_string());
            }

            println!(
                "[Agent] dry_run path \"{}\": exists={} readable={} type={} size={}B{}",
                result.path,
                result.exists,
                result.readable,
                result.file_type,
                result.size_bytes,
                result
                    .error
                    .as_ref()
                    .map(|e| format!(" error=\"{}\"", e))
                    .unwrap_or_default()
            );

            path_results.push(result);
        }

        let reachable: Vec<_> = path_results
            .iter()
            .filter(|r| r.exists && r.readable)
            .map(|r| r.path.clone())
            .collect();

        let compressed_estimate = (total_bytes as f64 * compression_ratio).ceil() as u64;
        let storage_required = total_bytes + total_bytes + compressed_estimate;

        let response = serde_json::json!({
            "type": "dry_run_result",
            "requestId": request_id,
            "files_found": !reachable.is_empty(),
            "file_count": reachable.len(),
            "files": reachable,
            "storage_required": storage_required,
            "path_results": path_results,
        });

        println!(
            "[Agent] Sending dry_run_result ({}): {}/{} paths reachable, storage_required={}B",
            request_id,
            reachable.len(),
            paths.len(),
            storage_required
        );

        cmd_tx.send(Message::Text(response.to_string())).await?;

        Ok(())
    }

    async fn queue_backup_job(
        job: BackupJobState,
        job_queue: &Arc<Mutex<VecDeque<BackupJobState>>>,
        current_job: &Arc<Mutex<Option<BackupJobState>>>,
        cmd_tx: &tokio::sync::mpsc::Sender<Message>,
    ) {
        job_queue.lock().await.push_back(job.clone());
        println!(
            "[Agent] Backup job {} queued. Queue length: {}",
            job.id,
            job_queue.lock().await.len()
        );

        // Process if nothing is running
        if current_job.lock().await.is_none() {
            Self::process_next_job(job_queue, current_job, cmd_tx).await;
        }
    }

    async fn process_next_job(
        job_queue: &Arc<Mutex<VecDeque<BackupJobState>>>,
        current_job: &Arc<Mutex<Option<BackupJobState>>>,
        cmd_tx: &tokio::sync::mpsc::Sender<Message>,
    ) {
        let mut queue = job_queue.lock().await;
        let mut current = current_job.lock().await;

        if current.is_some() || queue.is_empty() {
            return;
        }

        let mut job = queue.pop_front().unwrap();
        job.status = JobStatus::Running;
        job.started_at = Some(chrono::Utc::now().to_rfc3339());
        *current = Some(job.clone());
        drop(current);
        drop(queue);

        println!("[Agent] Starting backup job {}...", job.id);
        notifications::notify_started();
        if let Some(ipc) = IPC.get() {
            ipc.notify_started();
            ipc.set_status(StatusState::Running { progress: None });
        }

        // Send status update
        Self::send_backup_status(&job.id, "running", None, None, cmd_tx).await;

        // Send full status report to update UI immediately
        let full_status = Self::build_status_report(current_job, job_queue).await;
        let _ = cmd_tx.send(Message::Text(full_status)).await;

        // Progress updates → update status_message and push agent_status
        let (progress_tx, mut progress_rx) = tokio::sync::mpsc::channel::<String>(32);
        let current_job_for_progress = current_job.clone();
        let job_queue_for_progress = job_queue.clone();
        let cmd_tx_for_progress = cmd_tx.clone();
        tokio::spawn(async move {
            while let Some(msg) = progress_rx.recv().await {
                if let Some(ipc) = IPC.get() {
                    ipc.set_status(StatusState::Running {
                        progress: parse_pct_from_msg(&msg),
                    });
                }
                {
                    let mut cur = current_job_for_progress.lock().await;
                    if let Some(ref mut j) = *cur {
                        j.status_message = Some(msg);
                    }
                }
                let status =
                    Self::build_status_report(&current_job_for_progress, &job_queue_for_progress)
                        .await;
                let _ = cmd_tx_for_progress.send(Message::Text(status)).await;
            }
        });

        // Spawn backup task
        let job_clone = job.clone();
        let cmd_tx_clone = cmd_tx.clone();
        let current_job_clone = current_job.clone();
        let job_queue_clone = job_queue.clone();

        tokio::spawn(async move {
            let result = backup::run_backup_job(&job_clone, progress_tx).await;

            {
                let mut current = current_job_clone.lock().await;
                match result {
                    Ok(size_bytes) => {
                        println!(
                            "[Agent] Backup job {} completed successfully.",
                            job_clone.id
                        );
                        notifications::notify_finished(size_bytes);
                        if let Some(ipc) = IPC.get() {
                            ipc.notify_finished(size_bytes);
                            ipc.set_status(StatusState::Idle);
                        }
                        if let Some(ref mut j) = *current {
                            j.status = JobStatus::Completed;
                            j.completed_at = Some(chrono::Utc::now().to_rfc3339());
                        }
                        Self::send_backup_status(
                            &job_clone.id,
                            "completed",
                            None,
                            Some(size_bytes),
                            &cmd_tx_clone,
                        )
                        .await;
                    }
                    Err(e) => {
                        eprintln!("[Agent] Backup job {} failed: {}", job_clone.id, e);
                        notifications::notify_failed(&e.to_string());
                        if let Some(ipc) = IPC.get() {
                            ipc.notify_failed(e.to_string());
                            ipc.set_status(StatusState::Idle);
                        }
                        if let Some(ref mut j) = *current {
                            j.status = JobStatus::Failed;
                            j.error = Some(e.to_string());
                            j.completed_at = Some(chrono::Utc::now().to_rfc3339());
                        }
                        Self::send_backup_status(
                            &job_clone.id,
                            "failed",
                            Some(e.to_string()),
                            None,
                            &cmd_tx_clone,
                        )
                        .await;
                    }
                }
            }

            // Send full status report immediately to update UI
            let full_status = Self::build_status_report(&current_job_clone, &job_queue_clone).await;
            let _ = cmd_tx_clone.send(Message::Text(full_status)).await;

            // Clear current job and immediately push the cleared status
            {
                let mut current = current_job_clone.lock().await;
                *current = None;
            }
            let full_status = Self::build_status_report(&current_job_clone, &job_queue_clone).await;
            let _ = cmd_tx_clone.send(Message::Text(full_status)).await;
        });
    }

    async fn send_backup_status(
        backup_id: &str,
        status: &str,
        error: Option<String>,
        size_bytes: Option<u64>,
        cmd_tx: &tokio::sync::mpsc::Sender<Message>,
    ) {
        let mut metadata = serde_json::json!({});

        if let Some(err) = error {
            metadata["error"] = serde_json::Value::String(err);
        }
        if let Some(size) = size_bytes {
            metadata["size_bytes"] = serde_json::Value::Number(size.into());
        }

        let msg = serde_json::json!({
            "type": "backup_status",
            "backupId": backup_id,
            "status": status,
            "metadata": metadata
        });

        let _ = cmd_tx.send(Message::Text(msg.to_string())).await;
        println!("[Agent] Sent backup status: {} = {}", backup_id, status);
    }

    async fn build_status_report(
        current_job: &Arc<Mutex<Option<BackupJobState>>>,
        job_queue: &Arc<Mutex<VecDeque<BackupJobState>>>,
    ) -> String {
        let current = current_job.lock().await.clone();
        let queue: Vec<_> = job_queue.lock().await.iter().cloned().collect();

        serde_json::json!({
            "type": "agent_status",
            "currentJob": current,
            "jobQueue": queue,
            "timestamp": chrono::Utc::now().to_rfc3339()
        })
        .to_string()
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();

    if args.len() > 1 && args[1] == "setup" {
        if args.len() < 3 {
            eprintln!("\x1b[31m[Setup] Usage: agent setup <agentCode>\x1b[0m");
            std::process::exit(1);
        }
        setup::run_setup(&args[2]).await?;
        Ok(())
    } else {
        let agent = BackuprAgent::new().await?;
        agent.start().await
    }
}
