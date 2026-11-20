//! Handing the keyboard to the chat line in the strip's window, and back to
//! whatever had it (the game).
//!
//! The chat line lives in a window of ours that floats over the game. To type
//! in it, that window has to become the one Windows sends keys to, and when
//! the line is sent the game has to get the keyboard back at once. Windows
//! guards the first of these: a program may not put itself in front unless
//! the user has just used it. Three ways are tried, in order, and the page is
//! told which one worked, so that a trial can say what a given game allows.
//!
//! Nothing here looks at what is typed. The game's window is only ever asked
//! one thing: to be in front again.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use tauri::{AppHandle, Emitter, Manager};

/// The window that had the keyboard before the chat line took it; 0 for none.
static PREVIOUS: AtomicIsize = AtomicIsize::new(0);
/// The last window in front that was not one of ours, looked at a few times a second.
static LAST_OTHER: AtomicIsize = AtomicIsize::new(0);
/// True while the player is typing a chat line. Talk keys are letters as often
/// as not, and must not open the mic while they are being typed.
static TYPING: AtomicBool = AtomicBool::new(false);

/// Typing counts only while one of our windows has the keyboard. The page says when the chat line
/// gets and loses it, but a line that disappears while it has the keyboard, or a click into the game,
/// may never say so; with the game in front, a talk key must always be a talk key.
pub fn typing() -> bool {
    TYPING.load(Ordering::Relaxed) && ours_in_front()
}

#[cfg(windows)]
fn ours_in_front() -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    unsafe {
        let window = GetForegroundWindow();
        if window.is_null() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(window, &mut pid);
        pid == std::process::id()
    }
}
#[cfg(not(windows))]
fn ours_in_front() -> bool {
    true
}

#[derive(Clone, Serialize)]
struct KeyPayload {
    /// "direct", "attach": the keyboard was taken, and how. "failed": Windows
    /// refused. "back": the key was pressed while typing, and the game has the
    /// keyboard again. "closed": the strip's window is not open.
    how: &'static str,
}

/// The chat key was pressed. Called off the capture thread.
pub fn on_key(app: &AppHandle) {
    let Some(window) = app.get_webview_window("strip") else {
        let _ = app.emit("chat-key", KeyPayload { how: "closed" });
        return;
    };
    let how = if typing() {
        give_back();
        "back"
    } else {
        take(&window)
    };
    let _ = app.emit_to("strip", "chat-key", KeyPayload { how });
}

/// A button in the chat window was clicked (an answer to a ready check): that click took the
/// keyboard from the game, and nothing is going to be typed. The game gets it back.
pub fn hand_back() -> bool {
    PREVIOUS.store(LAST_OTHER.load(Ordering::Relaxed), Ordering::Relaxed);
    give_back()
}

/// The chat line got or lost the keyboard by itself (the player clicked in it, or away).
pub fn set_typing(on: bool) {
    if on && !typing() {
        PREVIOUS.store(LAST_OTHER.load(Ordering::Relaxed), Ordering::Relaxed);
    }
    TYPING.store(on, Ordering::Relaxed);
}

#[cfg(windows)]
mod win {
    use super::{LAST_OTHER, PREVIOUS, TYPING};
    use std::sync::atomic::Ordering;
    use std::time::Duration;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, IsWindow, SetForegroundWindow,
    };

    fn front() -> isize {
        unsafe { GetForegroundWindow() as isize }
    }

    pub fn take(window: &tauri::WebviewWindow) -> &'static str {
        let Ok(handle) = window.hwnd() else { return "failed" };
        let ours = handle.0 as isize;
        let before = front();
        PREVIOUS.store(
            if before != 0 && before != ours { before } else { LAST_OTHER.load(Ordering::Relaxed) },
            Ordering::Relaxed,
        );

        // 1. The ordinary way. (The window library itself, when Windows says no, presses
        //    Alt for an instant, which makes Windows count us as the program last used.)
        let _ = window.set_focus();
        std::thread::sleep(Duration::from_millis(60));
        let mut how = if front() == ours { "direct" } else { "failed" };

        // 2. Borrow the right from the window in front, by sharing its input queue for a moment.
        if how == "failed" {
            unsafe {
                let theirs = GetWindowThreadProcessId(GetForegroundWindow(), std::ptr::null_mut());
                let mine = GetCurrentThreadId();
                if theirs != 0 && AttachThreadInput(mine, theirs, 1) != 0 {
                    BringWindowToTop(ours as HWND);
                    SetForegroundWindow(ours as HWND);
                    AttachThreadInput(mine, theirs, 0);
                }
            }
            std::thread::sleep(Duration::from_millis(60));
            if front() == ours {
                // The window is in front; the page inside it still has to be given the keys.
                let _ = window.set_focus();
                how = "attach";
            }
        }

        if how != "failed" {
            TYPING.store(true, Ordering::Relaxed);
        }
        how
    }

    /// Puts the window that had the keyboard in front again. We are in front
    /// ourselves at this moment, which is what allows it.
    pub fn give_back() -> bool {
        TYPING.store(false, Ordering::Relaxed);
        let previous = PREVIOUS.load(Ordering::Relaxed);
        if previous == 0 {
            return false;
        }
        unsafe { IsWindow(previous as HWND) != 0 && SetForegroundWindow(previous as HWND) != 0 }
    }

    /// Remembers, a few times a second, which window of another program is in
    /// front: the one to go back to when the player clicked into the chat line
    /// instead of pressing the chat key.
    pub fn watch() {
        std::thread::spawn(|| {
            let me = std::process::id();
            loop {
                std::thread::sleep(Duration::from_millis(200));
                unsafe {
                    let window = GetForegroundWindow();
                    if window.is_null() {
                        continue;
                    }
                    let mut pid = 0u32;
                    GetWindowThreadProcessId(window, &mut pid);
                    if pid != 0 && pid != me {
                        LAST_OTHER.store(window as isize, Ordering::Relaxed);
                    }
                }
            }
        });
    }
}

#[cfg(windows)]
fn take(window: &tauri::WebviewWindow) -> &'static str {
    win::take(window)
}
#[cfg(not(windows))]
fn take(window: &tauri::WebviewWindow) -> &'static str {
    let _ = PREVIOUS.load(Ordering::Relaxed);
    let _ = LAST_OTHER.load(Ordering::Relaxed);
    if window.set_focus().is_ok() {
        TYPING.store(true, Ordering::Relaxed);
        "direct"
    } else {
        "failed"
    }
}

/// The line was sent or given up: the game gets the keyboard back.
#[cfg(windows)]
pub fn give_back() -> bool {
    win::give_back()
}
#[cfg(not(windows))]
pub fn give_back() -> bool {
    TYPING.store(false, Ordering::Relaxed);
    false
}

pub fn watch() {
    #[cfg(windows)]
    win::watch();
}
