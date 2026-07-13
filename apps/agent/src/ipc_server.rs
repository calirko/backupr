use std::sync::Mutex;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;
use tokio::sync::broadcast;

use crate::ipc::{IPC_PORT, IpcMessage, NotifyEvent, StatusState};

pub struct IpcHandle {
    pub tx: broadcast::Sender<IpcMessage>,
    state: Mutex<StatusState>,
}

impl IpcHandle {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(64);
        Self {
            tx,
            state: Mutex::new(StatusState::Idle),
        }
    }

    pub fn set_status(&self, s: StatusState) {
        *self.state.lock().unwrap() = s.clone();
        let _ = self.tx.send(IpcMessage::Status { state: s });
    }

    pub fn notify_started(&self) {
        let _ = self.tx.send(IpcMessage::Notify {
            event: NotifyEvent::Started,
        });
    }

    pub fn notify_finished(&self, size_bytes: u64) {
        let _ = self.tx.send(IpcMessage::Notify {
            event: NotifyEvent::Finished { size_bytes },
        });
    }

    pub fn notify_failed(&self, error: String) {
        let _ = self.tx.send(IpcMessage::Notify {
            event: NotifyEvent::Failed { error },
        });
    }

    fn current_state(&self) -> StatusState {
        self.state.lock().unwrap().clone()
    }
}

pub async fn run_ipc_server(handle: std::sync::Arc<IpcHandle>) {
    let addr = format!("127.0.0.1:{}", IPC_PORT);

    // Retry binding — during a self-update the old process may still hold
    // the port for a brief moment after it spawns the new one.
    let listener = {
        const MAX_ATTEMPTS: u32 = 20;
        const RETRY_MS: u64 = 250;
        let mut last_err: Option<std::io::Error> = None;
        let mut bound = None;
        for attempt in 0..MAX_ATTEMPTS {
            match TcpListener::bind(&addr).await {
                Ok(l) => {
                    bound = Some(l);
                    break;
                }
                Err(e) => {
                    if attempt == 0 {
                        eprintln!("[IPC] Port {} in use, retrying...", addr);
                    }
                    last_err = Some(e);
                    tokio::time::sleep(tokio::time::Duration::from_millis(RETRY_MS)).await;
                }
            }
        }
        match bound {
            Some(l) => l,
            None => {
                eprintln!(
                    "[IPC] Could not bind {} after {} attempts: {}",
                    addr,
                    MAX_ATTEMPTS,
                    last_err.unwrap()
                );
                return;
            }
        }
    };
    println!("[IPC] Tray server listening on {}", addr);

    loop {
        match listener.accept().await {
            Ok((mut stream, peer)) => {
                println!("[IPC] Tray connected ({})", peer);
                let tx = handle.tx.clone();
                let initial = handle.current_state();

                tokio::spawn(async move {
                    // Send current state immediately so the tray shows the right status on connect.
                    if let Ok(line) = serde_json::to_string(&IpcMessage::Status { state: initial })
                        && stream.write_all((line + "\n").as_bytes()).await.is_err() {
                            return;
                        }

                    let mut rx = tx.subscribe();
                    while let Ok(msg) = rx.recv().await {
                        if let Ok(line) = serde_json::to_string(&msg)
                            && stream.write_all((line + "\n").as_bytes()).await.is_err() {
                                break;
                            }
                    }
                    println!("[IPC] Tray disconnected");
                });
            }
            Err(e) => eprintln!("[IPC] Accept error: {}", e),
        }
    }
}
