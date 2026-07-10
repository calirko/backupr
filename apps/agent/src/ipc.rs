use serde::{Deserialize, Serialize};

pub const IPC_PORT: u16 = 40711;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum IpcMessage {
    Status { state: StatusState },
    Notify { event: NotifyEvent },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum StatusState {
    Idle,
    Running { progress: Option<f32> },
}

impl StatusState {
    #[allow(dead_code)]
    pub fn tooltip(&self) -> String {
        match self {
            StatusState::Idle => "Backupr \u{00b7} Idle".to_string(),
            StatusState::Running { progress: Some(p) } => {
                format!("Backupr \u{00b7} Backing up {:.0}%", p * 100.0)
            }
            StatusState::Running { progress: None } => {
                "Backupr \u{00b7} Backing up\u{2026}".to_string()
            }
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub enum NotifyEvent {
    Started,
    Finished { size_bytes: u64 },
    Failed { error: String },
}
