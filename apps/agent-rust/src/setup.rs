use crate::lib::config::{AgentConfig, ConfigManager};
use anyhow::Result;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::Value;

// Decoded from the base64 agent code
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentCodePayload {
    server_url: String,
    agent_code: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PairRequest {
    agent_code: String,
    name: String,
    info: PairInfo,
}

#[derive(Debug, Serialize)]
struct PairInfo {
    platform: String,
    arch: String,
    release: String,
    cpus: usize,
    hostname: String,
    agent_version: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct PairResponse {
    token: Option<String>,
    error: Option<String>,
}

pub async fn run_setup(agent_code: &str) -> Result<()> {
    println!("[Setup] Pairing with server...");

    // Decode base64 agent code (same as your atob())
    let decoded_bytes = STANDARD
        .decode(agent_code)
        .map_err(|e| anyhow::anyhow!("Invalid agent code (could not decode base64): {}", e))?;

    let decoded_str = String::from_utf8(decoded_bytes)
        .map_err(|e| anyhow::anyhow!("Invalid agent code (not valid UTF-8): {}", e))?;

    let payload: AgentCodePayload = serde_json::from_str(&decoded_str).map_err(|e| {
        anyhow::anyhow!(
            "Invalid agent code (could not parse JSON): {}. Got: {}",
            e,
            decoded_str
        )
    })?;

    let server_url = payload.server_url.trim_end_matches('/').to_string();
    let code = payload.agent_code;

    // Gather system info (same fields as your os.* calls)
    let hostname = hostname::get()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let platform = std::env::consts::OS.to_string(); // "windows", "linux", "macos"
    let arch = std::env::consts::ARCH.to_string(); // "x86_64", "aarch64", etc.

    // OS release version
    let release = get_os_release();

    let cpus = num_cpus::get();

    let pair_request = PairRequest {
        agent_code: code,
        name: hostname.clone(),
        info: PairInfo {
            platform,
            arch,
            release,
            cpus,
            hostname,
            agent_version: env!("CARGO_PKG_VERSION").to_string(),
        },
    };

    // POST to /api/agents/pair
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/api/agents/pair", server_url))
        .header("Content-Type", "application/json")
        .json(&pair_request)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("[Setup] Failed to reach server: {}", e))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|e| anyhow::anyhow!("[Setup] Failed to read response body: {}", e))?;

    if !status.is_success() {
        // Try to parse as JSON for error message, but fall back to plain text
        let error_msg = if let Ok(error_json) = serde_json::from_str::<Value>(body_text.trim()) {
            error_json["error"]
                .as_str()
                .unwrap_or(&body_text)
                .to_string()
        } else {
            body_text.clone()
        };
        anyhow::bail!("[Setup] Server returned {}: {}", status, error_msg);
    }

    let pair_response: Value = serde_json::from_str(body_text.trim())
        .map_err(|e| anyhow::anyhow!("[Setup] Failed to parse server response (body: {}): {}", body_text, e))?;

    let token = pair_response["token"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("[Setup] Server response did not include a token. Response was: {}", body_text))?
        .to_string();

    // Derive WebSocket URL from server URL
    // Same logic as your TS: replace http->ws, strip /api suffix
    let ws_url = server_url
        .replace("https://", "wss://")
        .replace("http://", "ws://");
    let ws_url = ws_url
        .trim_end_matches("/api")
        .trim_end_matches('/')
        .to_string();

    // Save config
    ConfigManager::update(AgentConfig {
        server_url: Some(server_url),
        ws_url: Some(ws_url),
        agent_token: Some(token),
        vss_enabled: None,
    })
    .await?;

    println!("\x1b[32m[Setup] Success! Agent registered and token saved.\x1b[0m");
    Ok(())
}

fn get_os_release() -> String {
    // Best-effort: read kernel/OS version
    #[cfg(target_os = "windows")]
    {
        // On Windows, use the registry or ver command
        std::process::Command::new("cmd")
            .args(["/C", "ver"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .unwrap_or_else(|| "Windows".to_string())
            .trim()
            .to_string()
    }

    #[cfg(target_os = "linux")]
    {
        // Try /etc/os-release first
        if let Ok(content) = std::fs::read_to_string("/etc/os-release") {
            for line in content.lines() {
                if line.starts_with("PRETTY_NAME=") {
                    return line
                        .trim_start_matches("PRETTY_NAME=")
                        .trim_matches('"')
                        .to_string();
                }
            }
        }
        // Fallback to uname
        std::process::Command::new("uname")
            .arg("-r")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .unwrap_or_else(|| "Linux".to_string())
            .trim()
            .to_string()
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        "unknown".to_string()
    }
}
