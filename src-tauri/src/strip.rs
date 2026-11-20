//! Keeps the compact strip drawn over a game.
//!
//! A player found that once the game had lost the keyboard and got it back,
//! the strip went on showing what it showed at that moment, until it was
//! dragged a little. Moving the window is what brings it back, so whenever the
//! window in front changes, the strip is moved one pixel and back, without
//! taking the keyboard; and once more a second later, for a game that takes a
//! moment to come back.

use tauri::AppHandle;

#[cfg(windows)]
pub fn watch(app: AppHandle) {
    use std::time::{Duration, Instant};
    use tauri::{Manager, PhysicalPosition};
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    std::thread::spawn(move || {
        let mut last: isize = 0;
        let mut again: Option<Instant> = None;
        loop {
            std::thread::sleep(Duration::from_millis(200));
            let front = unsafe { GetForegroundWindow() } as isize;
            let changed = front != last;
            last = front;
            let due = again.is_some_and(|t| Instant::now() >= t);
            if !changed && !due {
                continue;
            }
            again = if changed { Some(Instant::now() + Duration::from_millis(1000)) } else { None };
            let Some(strip) = app.get_webview_window("strip") else { continue };
            // The player is using the strip itself (dragging it, typing in the chat): leave it be.
            if strip.hwnd().map(|h| h.0 as isize == front).unwrap_or(true) {
                continue;
            }
            if !strip.is_visible().unwrap_or(false) {
                continue;
            }
            let Ok(at) = strip.outer_position() else { continue };
            let _ = strip.set_position(PhysicalPosition::new(at.x + 1, at.y));
            let _ = strip.set_position(PhysicalPosition::new(at.x, at.y));
        }
    });
}

#[cfg(not(windows))]
pub fn watch(_app: AppHandle) {}
