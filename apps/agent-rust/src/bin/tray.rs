#![windows_subsystem = "windows"]

use std::io::{BufRead, BufReader};
use std::net::TcpStream;
use std::sync::mpsc;
use std::time::Duration;

#[path = "../ipc.rs"]
mod ipc;
use ipc::{IpcMessage, IPC_PORT, NotifyEvent};
use tray_icon::menu::{Menu, MenuItem};
use tray_icon::TrayIconBuilder;

// ---------------------------------------------------------------------------
// IPC thread → tray thread
// ---------------------------------------------------------------------------

enum TrayEvent {
    Msg(IpcMessage),
    Disconnected,
}

fn main() {
    let (tx, rx) = mpsc::channel::<TrayEvent>();
    std::thread::spawn(move || ipc_loop(tx));
    run_tray(rx);
}

fn ipc_loop(tx: mpsc::Sender<TrayEvent>) {
    loop {
        match TcpStream::connect(("127.0.0.1", IPC_PORT)) {
            Ok(stream) => {
                let reader = BufReader::new(stream);
                for line in reader.lines() {
                    match line {
                        Ok(text) if !text.is_empty() => {
                            if let Ok(msg) = serde_json::from_str::<IpcMessage>(&text) {
                                if tx.send(TrayEvent::Msg(msg)).is_err() {
                                    return; // main thread exited
                                }
                            }
                        }
                        Ok(_) => {}
                        Err(_) => break,
                    }
                }
                let _ = tx.send(TrayEvent::Disconnected);
            }
            Err(_) => {} // service not running yet, retry below
        }
        std::thread::sleep(Duration::from_secs(3));
    }
}

// ---------------------------------------------------------------------------
// Tray icon
// ---------------------------------------------------------------------------

const LABEL_UNAVAILABLE: &str = "Backupr \u{00b7} Service unavailable";

fn load_icon() -> tray_icon::Icon {
    let bytes = include_bytes!("../assets/icon-agent.png");
    let img = image::load_from_memory(bytes)
        .expect("Failed to decode icon-agent.png")
        .into_rgba8();
    let (w, h) = img.dimensions();
    tray_icon::Icon::from_rgba(img.into_raw(), w, h).expect("Failed to create tray icon")
}

fn run_tray(rx: mpsc::Receiver<TrayEvent>) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE, WM_QUIT,
    };

    let icon = load_icon();
    let status_item = MenuItem::new(LABEL_UNAVAILABLE, false, None);
    let menu = Menu::new();
    menu.append(&status_item).unwrap();

    let tray = match TrayIconBuilder::new()
        .with_icon(icon)
        .with_tooltip(LABEL_UNAVAILABLE)
        .with_menu(Box::new(menu))
        .build()
    {
        Ok(t) => t,
        Err(e) => {
            eprintln!("[Tray] Failed to create tray icon: {}", e);
            return;
        }
    };

    // Win32 message loop — required for Shell_NotifyIcon to dispatch events.
    unsafe {
        let mut msg: MSG = std::mem::zeroed();
        loop {
            // Drain pending Win32 messages (non-blocking).
            while PeekMessageW(&mut msg, 0, 0, 0, PM_REMOVE) != 0 {
                if msg.message == WM_QUIT {
                    return;
                }
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            // Drain pending IPC events.
            while let Ok(event) = rx.try_recv() {
                match event {
                    TrayEvent::Msg(IpcMessage::Status { state }) => {
                        let label = state.tooltip();
                        let _ = tray.set_tooltip(Some(label.as_str()));
                        status_item.set_text(label.as_str());
                    }
                    TrayEvent::Msg(IpcMessage::Notify { event }) => {
                        fire_notification(&event);
                    }
                    TrayEvent::Disconnected => {
                        let _ = tray.set_tooltip(Some(LABEL_UNAVAILABLE));
                        status_item.set_text(LABEL_UNAVAILABLE);
                    }
                }
            }

            std::thread::sleep(Duration::from_millis(50));
        }
    }
}

// ---------------------------------------------------------------------------
// Notifications — WinRT toasts via PowerShell (user session, works here)
// ---------------------------------------------------------------------------

fn fire_notification(event: &NotifyEvent) {
    let pt = is_pt();
    let body = match event {
        NotifyEvent::Started => {
            if pt { "Backup iniciado".to_string() } else { "Backup started".to_string() }
        }
        NotifyEvent::Finished { size_bytes } => {
            let size = fmt_bytes(*size_bytes);
            if pt { format!("Backup conclu\u{00ed}do \u{00b7} {size}") }
            else   { format!("Backup complete \u{00b7} {size}") }
        }
        NotifyEvent::Failed { error } => {
            let msg = if error.len() > 120 { &error[..120] } else { error.as_str() };
            if pt { format!("Backup falhou: {msg}") } else { format!("Backup failed: {msg}") }
        }
    };
    toast("Backupr", &body);
}

fn toast(title: &str, body: &str) {
    let ps_esc = |s: &str| s.replace('\'', "''");
    let xml_esc = |s: &str| {
        s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
    };
    let t = ps_esc(&xml_esc(title));
    let b = ps_esc(&xml_esc(body));
    let script = format!(
        "[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null;\
         $a='{{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}}\\WindowsPowerShell\\v1.0\\powershell.exe';\
         $x=New-Object Windows.Data.Xml.Dom.XmlDocument;\
         $x.LoadXml('<toast><visual><binding template=\"ToastGeneric\"><text>{t}</text><text>{b}</text></binding></visual></toast>');\
         $tn=[Windows.UI.Notifications.ToastNotification]::new($x);\
         [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($a).Show($tn)",
    );
    // Fire-and-forget — don't block the message loop waiting for PowerShell.
    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
        .spawn();
}

// ---------------------------------------------------------------------------
// Locale detection
// ---------------------------------------------------------------------------

fn is_pt() -> bool {
    for var in ["LANG", "LANGUAGE", "LC_ALL", "LC_MESSAGES"] {
        if let Ok(v) = std::env::var(var) {
            if v.to_ascii_lowercase().starts_with("pt") {
                return true;
            }
        }
    }
    unsafe extern "system" {
        fn GetUserDefaultLocaleName(lp_locale_name: *mut u16, cch_locale_name: i32) -> i32;
    }
    let mut buf = [0u16; 85];
    let len = unsafe { GetUserDefaultLocaleName(buf.as_mut_ptr(), buf.len() as i32) };
    if len > 1 {
        String::from_utf16_lossy(&buf[..(len as usize - 1)])
            .to_ascii_lowercase()
            .starts_with("pt")
    } else {
        false
    }
}

// ---------------------------------------------------------------------------
// Size formatting
// ---------------------------------------------------------------------------

fn fmt_bytes(b: u64) -> String {
    const GB: u64 = 1 << 30;
    const MB: u64 = 1 << 20;
    const KB: u64 = 1 << 10;
    if b >= GB      { format!("{:.1} GB", b as f64 / GB as f64) }
    else if b >= MB { format!("{:.1} MB", b as f64 / MB as f64) }
    else if b >= KB { format!("{:.1} KB", b as f64 / KB as f64) }
    else            { format!("{b} B") }
}
