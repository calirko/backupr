use std::sync::Mutex;
use std::time::{Duration, Instant};

// Suppress duplicate start notifications when the server bursts multiple jobs into the queue.
const START_THROTTLE: Duration = Duration::from_secs(30);

static LAST_START: Mutex<Option<Instant>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub fn notify_started() {
    {
        let mut g = LAST_START.lock().unwrap();
        if g.is_some_and(|t| t.elapsed() < START_THROTTLE) {
            return;
        }
        *g = Some(Instant::now());
    }
    let body = if is_pt() {
        "Backup iniciado"
    } else {
        "Backup started"
    };
    fire("Backupr", body, Kind::Info);
}

pub fn notify_finished(size_bytes: u64) {
    let size = fmt_bytes(size_bytes);
    let body = if is_pt() {
        format!("Backup concluído · {size}")
    } else {
        format!("Backup complete · {size}")
    };
    fire("Backupr", &body, Kind::Info);
}

pub fn notify_failed(error: &str) {
    // Keep the message short enough to fit in a notification bubble.
    let msg = if error.len() > 120 {
        &error[..120]
    } else {
        error
    };
    let body = if is_pt() {
        format!("Backup falhou: {msg}")
    } else {
        format!("Backup failed: {msg}")
    };
    fire("Backupr", &body, Kind::Error);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
enum Kind {
    Info,
    Error,
}

/// Dispatch the notification on a detached OS thread so we never block the
/// async runtime - notification sends can take a moment (PowerShell startup on
/// Windows, or a brief D-Bus round-trip on Linux).
fn fire(title: &str, body: &str, kind: Kind) {
    let title = title.to_owned();
    let body = body.to_owned();
    std::thread::spawn(move || send(&title, &body, kind));
}

// ---------------------------------------------------------------------------
// Locale detection
// ---------------------------------------------------------------------------

fn is_pt() -> bool {
    // Standard POSIX locale env vars - work on Linux and are sometimes set on Windows too.
    for var in ["LANG", "LANGUAGE", "LC_ALL", "LC_MESSAGES"] {
        if let Ok(v) = std::env::var(var)
            && v.to_ascii_lowercase().starts_with("pt")
        {
            return true;
        }
    }
    #[cfg(windows)]
    return win_locale_is_pt();
    #[cfg(not(windows))]
    false
}

#[cfg(windows)]
fn win_locale_is_pt() -> bool {
    // GetUserDefaultLocaleName returns a BCP-47 tag like "pt-BR" or "en-US".
    // We avoid the winapi crate by declaring the import ourselves.
    unsafe extern "system" {
        fn GetUserDefaultLocaleName(lp_locale_name: *mut u16, cch_locale_name: i32) -> i32;
    }
    let mut buf = [0u16; 85];
    let len = unsafe { GetUserDefaultLocaleName(buf.as_mut_ptr(), buf.len() as i32) };
    if len > 1 {
        // len includes the null terminator
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
    if b >= GB {
        format!("{:.1} GB", b as f64 / GB as f64)
    } else if b >= MB {
        format!("{:.1} MB", b as f64 / MB as f64)
    } else if b >= KB {
        format!("{:.1} KB", b as f64 / KB as f64)
    } else {
        format!("{b} B")
    }
}

// ---------------------------------------------------------------------------
// Platform send implementations
// ---------------------------------------------------------------------------

#[cfg(target_os = "linux")]
fn send(title: &str, body: &str, kind: Kind) {
    let urgency = match kind {
        Kind::Error => "critical",
        Kind::Info => "normal",
    };
    // notify-send is part of libnotify-bin, available on virtually all desktop Linux distros.
    // -a sets the app name shown in the notification.
    // --icon uses a themed icon name; "drive-harddisk" is universally available.
    let _ = std::process::Command::new("notify-send")
        .args([
            "-a",
            "Backupr",
            "--icon",
            "drive-harddisk",
            "-u",
            urgency,
            "-t",
            "5000",
            title,
            body,
        ])
        .status();
}

#[cfg(windows)]
fn send(_title: &str, _body: &str, _kind: Kind) {
    // The service runs in Session 0 and cannot reach user desktops.
    // Notifications are delivered by the tray app (src/bin/tray.rs) via IPC.
}

#[cfg(not(any(target_os = "linux", windows)))]
fn send(_title: &str, _body: &str, _kind: Kind) {}
