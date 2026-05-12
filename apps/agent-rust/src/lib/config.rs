use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ws_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_token: Option<String>,
}

pub struct ConfigManager;

impl ConfigManager {
    fn config_path() -> PathBuf {
        // Same behavior as your TS: config file sits next to the binary (cwd)
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("backupr.conf")
    }

    pub async fn load() -> Result<AgentConfig> {
        let path = Self::config_path();

        if !path.exists() {
            // Create empty config file as template (same as your TS version)
            Self::write(&AgentConfig::default()).await?;
            println!(
                "\x1b[33m[Config] Created config file: {}\x1b[0m",
                path.display()
            );
            println!("\x1b[33m[Config] Run: agent setup <agentCode> to configure.\x1b[0m");
            return Ok(AgentConfig::default());
        }

        let content = tokio::fs::read_to_string(&path)
            .await
            .map_err(|e| anyhow::anyhow!("[Config] Failed to read config file: {}", e))?;

        let config = serde_json::from_str::<AgentConfig>(&content)
            .map_err(|e| anyhow::anyhow!("[Config] Failed to parse config file: {}", e))?;

        Ok(config)
    }

    pub async fn update(partial: AgentConfig) -> Result<AgentConfig> {
        let mut current = Self::load().await?;

        // Merge: only overwrite fields that are Some in partial
        if partial.server_url.is_some() {
            current.server_url = partial.server_url;
        }
        if partial.ws_url.is_some() {
            current.ws_url = partial.ws_url;
        }
        if partial.agent_token.is_some() {
            current.agent_token = partial.agent_token;
        }

        Self::write(&current).await?;
        Ok(current)
    }

    pub async fn clear() -> Result<()> {
        Self::write(&AgentConfig::default()).await
    }

    async fn write(config: &AgentConfig) -> Result<()> {
        let path = Self::config_path();
        let content = serde_json::to_string_pretty(config)?;

        tokio::fs::write(&path, content)
            .await
            .map_err(|e| anyhow::anyhow!("[Config] Failed to write config: {}", e))?;

        Ok(())
    }
}
