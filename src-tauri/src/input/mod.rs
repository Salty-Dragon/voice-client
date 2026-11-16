//! System-wide push-to-talk input.
//!
//! Three capture methods can be compared in the game, one at a time: a
//! low-level keyboard/mouse hook, Raw Input, and polling the key state. All
//! only observe; none swallows a key, so the game always receives it too.
//!
//! Privacy: nothing about a key leaves this module unless it is bound to a
//! net, or the user has just asked to bind a key. The diagnostic counters
//! carry counts only.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
mod win;

#[derive(Clone, Debug, Deserialize)]
pub struct Binding {
    pub net: String,
    pub code: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Hook,
    Raw,
    Poll,
}

#[derive(Clone, Serialize)]
struct PttPayload {
    net: String,
    down: bool,
    /// Epoch milliseconds, taken inside the capture callback.
    t: u64,
}

#[derive(Clone, Serialize)]
struct CapturedPayload {
    code: u32,
}

#[derive(Clone, Serialize)]
struct DiagPayload {
    hook: u64,
    raw: u64,
    poll: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundPayload {
    pub self_elevated: bool,
    pub elevated: Option<bool>,
    pub exe: String,
}

enum Out {
    Ptt(PttPayload),
    Captured(u32),
}

struct State {
    bindings: Vec<Binding>,
    source: Source,
    capture: bool,
    pressed_hook: HashSet<u32>,
    pressed_raw: HashSet<u32>,
    pressed_poll: HashSet<u32>,
    hook_count: u64,
    raw_count: u64,
    poll_count: u64,
}

static STATE: OnceLock<Mutex<State>> = OnceLock::new();
static TX: OnceLock<Mutex<Sender<Out>>> = OnceLock::new();

fn state() -> &'static Mutex<State> {
    STATE.get_or_init(|| {
        Mutex::new(State {
            bindings: Vec::new(),
            source: Source::Poll,
            capture: false,
            pressed_hook: HashSet::new(),
            pressed_raw: HashSet::new(),
            pressed_poll: HashSet::new(),
            hook_count: 0,
            raw_count: 0,
            poll_count: 0,
        })
    })
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// Left and right mouse buttons are never bindable.
const VK_LBUTTON: u32 = 0x01;
const VK_RBUTTON: u32 = 0x02;

/// Called from the capture callbacks. Must return fast: Windows drops a
/// low-level hook that stalls. It only takes a lock and queues a message.
#[allow(dead_code)]
pub(crate) fn on_input(src: Source, code: u32, down: bool) {
    let t = now_ms();
    let Ok(mut st) = state().lock() else { return };

    let pressed = match src {
        Source::Hook => &mut st.pressed_hook,
        Source::Raw => &mut st.pressed_raw,
        Source::Poll => &mut st.pressed_poll,
    };
    // Held keys auto-repeat; only transitions matter.
    let changed = if down { pressed.insert(code) } else { pressed.remove(&code) };
    if !changed {
        return;
    }
    match src {
        Source::Hook => st.hook_count += 1,
        Source::Raw => st.raw_count += 1,
        Source::Poll => st.poll_count += 1,
    }
    if src != st.source {
        return;
    }

    let Some(tx) = TX.get().and_then(|tx| tx.lock().ok()) else { return };
    if st.capture {
        if down && code != VK_LBUTTON && code != VK_RBUTTON {
            st.capture = false;
            let _ = tx.send(Out::Captured(code));
        }
        return;
    }
    for b in st.bindings.iter().filter(|b| b.code == code) {
        let _ = tx.send(Out::Ptt(PttPayload { net: b.net.clone(), down, t }));
    }
}

pub fn set_bindings(bindings: Vec<Binding>) {
    if let Ok(mut st) = state().lock() {
        st.bindings = bindings;
    }
}

pub fn set_source(source: Source) {
    if let Ok(mut st) = state().lock() {
        st.source = source;
        // A key held across the switch would otherwise look stuck down.
        st.pressed_hook.clear();
        st.pressed_raw.clear();
        st.pressed_poll.clear();
    }
    #[cfg(windows)]
    win::reconfigure();
}

#[allow(dead_code)]
pub(crate) fn current_source() -> Source {
    state().lock().map(|st| st.source).unwrap_or(Source::Poll)
}

pub fn capture_next() {
    if let Ok(mut st) = state().lock() {
        st.capture = true;
    }
}

pub fn start(app: AppHandle) {
    let (tx, rx) = channel::<Out>();
    let _ = TX.set(Mutex::new(tx));

    // Forwards queued input to the WebView, off the capture thread.
    let emit_app = app.clone();
    std::thread::spawn(move || {
        for out in rx {
            let _ = match out {
                Out::Ptt(p) => emit_app.emit("ptt", p),
                Out::Captured(code) => emit_app.emit("captured", CapturedPayload { code }),
            };
        }
    });

    // Once a second: counters and who is in the foreground.
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
        if let Ok(st) = state().lock() {
            let _ = app.emit("input-diag", DiagPayload { hook: st.hook_count, raw: st.raw_count, poll: st.poll_count });
        }
        if let Some(fg) = foreground() {
            let _ = app.emit("foreground", fg);
        }
    });

    #[cfg(windows)]
    win::start();
}

#[cfg(windows)]
fn foreground() -> Option<ForegroundPayload> {
    win::foreground()
}
#[cfg(not(windows))]
fn foreground() -> Option<ForegroundPayload> {
    None
}

#[cfg(windows)]
pub fn restart_as_admin() -> Result<(), String> {
    win::restart_as_admin()
}
#[cfg(not(windows))]
pub fn restart_as_admin() -> Result<(), String> {
    Err("Only available on Windows".into())
}
