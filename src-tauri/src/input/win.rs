//! Windows capture on one dedicated thread with its own message loop.
//!
//! Only one method is active at a time. Windows stops calling a process's
//! low-level keyboard hook once that same process registers for raw keyboard
//! input, so the two cannot run side by side: hook mode installs the hooks and
//! removes the Raw Input registration, raw mode does the reverse.

use super::{current_source, on_input, ForegroundPayload, Source};
use std::sync::atomic::{AtomicU32, Ordering};
use std::ffi::c_void;
use std::mem::{size_of, zeroed};
use std::ptr::{null, null_mut};

use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::{
    GetCurrentProcess, GetCurrentThreadId, OpenProcess, OpenProcessToken, QueryFullProcessImageNameW,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
use windows_sys::Win32::UI::Input::{
    GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER,
};
use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, CreateWindowExW, DefWindowProcW, DispatchMessageW, GetForegroundWindow,
    GetMessageW, GetWindowThreadProcessId, PostThreadMessageW, RegisterClassW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, WNDCLASSW,
};

// Numeric values from the Windows SDK headers, kept local so the build does
// not depend on which module a binding crate files them under.
const WH_KEYBOARD_LL: i32 = 13;
const WH_MOUSE_LL: i32 = 14;
const WM_INPUT: u32 = 0x00FF;
const WM_KEYDOWN: u32 = 0x0100;
const WM_KEYUP: u32 = 0x0101;
const WM_SYSKEYDOWN: u32 = 0x0104;
const WM_SYSKEYUP: u32 = 0x0105;
const WM_MBUTTONDOWN: u32 = 0x0207;
const WM_MBUTTONUP: u32 = 0x0208;
const WM_XBUTTONDOWN: u32 = 0x020B;
const WM_XBUTTONUP: u32 = 0x020C;
const HWND_MESSAGE: isize = -3;
const RID_INPUT: u32 = 0x1000_0003;
const RIDEV_INPUTSINK: u32 = 0x0000_0100;
const RIDEV_REMOVE: u32 = 0x0000_0001;
/// Private thread message: re-read the capture method and apply it.
const WM_APP_RECONFIGURE: u32 = 0x8000 + 1;

static INPUT_THREAD: AtomicU32 = AtomicU32::new(0);
const RIM_TYPEMOUSE: u32 = 0;
const RIM_TYPEKEYBOARD: u32 = 1;
const RI_KEY_BREAK: u16 = 1;
const RI_KEY_E0: u16 = 2;
const RI_MOUSE_MIDDLE_DOWN: u16 = 0x0010;
const RI_MOUSE_MIDDLE_UP: u16 = 0x0020;
const RI_MOUSE_BUTTON_4_DOWN: u16 = 0x0040;
const RI_MOUSE_BUTTON_4_UP: u16 = 0x0080;
const RI_MOUSE_BUTTON_5_DOWN: u16 = 0x0100;
const RI_MOUSE_BUTTON_5_UP: u16 = 0x0200;
const SW_SHOWNORMAL: i32 = 1;

const VK_MBUTTON: u32 = 0x04;
const VK_XBUTTON1: u32 = 0x05;
const VK_XBUTTON2: u32 = 0x06;
const VK_SHIFT: u32 = 0x10;
const VK_CONTROL: u32 = 0x11;
const VK_MENU: u32 = 0x12;
const VK_LSHIFT: u32 = 0xA0;
const VK_RSHIFT: u32 = 0xA1;
const VK_LCONTROL: u32 = 0xA2;
const VK_RCONTROL: u32 = 0xA3;
const VK_LMENU: u32 = 0xA4;
const VK_RMENU: u32 = 0xA5;
const SCAN_RSHIFT: u16 = 0x36;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let info = &*(lparam as *const KBDLLHOOKSTRUCT);
        match wparam as u32 {
            WM_KEYDOWN | WM_SYSKEYDOWN => on_input(Source::Hook, info.vkCode, true),
            WM_KEYUP | WM_SYSKEYUP => on_input(Source::Hook, info.vkCode, false),
            _ => {}
        }
    }
    // Always pass the event on: the game must still receive the key.
    CallNextHookEx(null_mut(), code, wparam, lparam)
}

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let msg = wparam as u32;
        match msg {
            WM_MBUTTONDOWN => on_input(Source::Hook, VK_MBUTTON, true),
            WM_MBUTTONUP => on_input(Source::Hook, VK_MBUTTON, false),
            WM_XBUTTONDOWN | WM_XBUTTONUP => {
                let info = &*(lparam as *const MSLLHOOKSTRUCT);
                let button = (info.mouseData >> 16) & 0xFFFF;
                let vk = if button == 1 { VK_XBUTTON1 } else { VK_XBUTTON2 };
                on_input(Source::Hook, vk, msg == WM_XBUTTONDOWN);
            }
            _ => {}
        }
    }
    CallNextHookEx(null_mut(), code, wparam, lparam)
}

unsafe fn handle_raw(lparam: LPARAM) {
    let mut ri: RAWINPUT = zeroed();
    let mut size = size_of::<RAWINPUT>() as u32;
    let read = GetRawInputData(
        lparam as HRAWINPUT,
        RID_INPUT,
        &mut ri as *mut RAWINPUT as *mut c_void,
        &mut size,
        size_of::<RAWINPUTHEADER>() as u32,
    );
    if read == u32::MAX || read == 0 {
        return;
    }
    if ri.header.dwType == RIM_TYPEKEYBOARD {
        let kb = ri.data.keyboard;
        let mut vk = kb.VKey as u32;
        if vk == 0 || vk >= 0xFF {
            return;
        }
        // Raw Input reports generic modifiers; the hook reports left/right.
        // Normalise so one binding works with either method.
        let e0 = kb.Flags & RI_KEY_E0 != 0;
        vk = match vk {
            VK_SHIFT => if kb.MakeCode == SCAN_RSHIFT { VK_RSHIFT } else { VK_LSHIFT },
            VK_CONTROL => if e0 { VK_RCONTROL } else { VK_LCONTROL },
            VK_MENU => if e0 { VK_RMENU } else { VK_LMENU },
            other => other,
        };
        on_input(Source::Raw, vk, kb.Flags & RI_KEY_BREAK == 0);
    } else if ri.header.dwType == RIM_TYPEMOUSE {
        let flags = ri.data.mouse.Anonymous.Anonymous.usButtonFlags;
        let pairs = [
            (RI_MOUSE_MIDDLE_DOWN, VK_MBUTTON, true),
            (RI_MOUSE_MIDDLE_UP, VK_MBUTTON, false),
            (RI_MOUSE_BUTTON_4_DOWN, VK_XBUTTON1, true),
            (RI_MOUSE_BUTTON_4_UP, VK_XBUTTON1, false),
            (RI_MOUSE_BUTTON_5_DOWN, VK_XBUTTON2, true),
            (RI_MOUSE_BUTTON_5_UP, VK_XBUTTON2, false),
        ];
        for (flag, vk, down) in pairs {
            if flags & flag != 0 {
                on_input(Source::Raw, vk, down);
            }
        }
    }
}

unsafe extern "system" fn wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if msg == WM_INPUT {
        handle_raw(lparam);
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

struct Capture {
    hinst: *mut c_void,
    hwnd: HWND,
    keyboard_hook: HHOOK,
    mouse_hook: HHOOK,
}

impl Capture {
    unsafe fn set_raw(&self, on: bool) {
        if self.hwnd.is_null() {
            return;
        }
        // Usage page 1: generic desktop. Usage 6 keyboard, 2 mouse.
        // INPUTSINK delivers input while another window has focus.
        // Removal requires a null target window.
        let flags = if on { RIDEV_INPUTSINK } else { RIDEV_REMOVE };
        let target = if on { self.hwnd } else { null_mut() };
        let devices = [
            RAWINPUTDEVICE { usUsagePage: 1, usUsage: 6, dwFlags: flags as _, hwndTarget: target },
            RAWINPUTDEVICE { usUsagePage: 1, usUsage: 2, dwFlags: flags as _, hwndTarget: target },
        ];
        RegisterRawInputDevices(devices.as_ptr(), 2, size_of::<RAWINPUTDEVICE>() as u32);
    }

    unsafe fn set_hooks(&mut self, on: bool) {
        if on {
            // Low-level hooks are called on this thread through its message loop.
            if self.keyboard_hook.is_null() {
                self.keyboard_hook =
                    SetWindowsHookExW(WH_KEYBOARD_LL as _, Some(keyboard_proc), self.hinst as _, 0);
            }
            if self.mouse_hook.is_null() {
                self.mouse_hook =
                    SetWindowsHookExW(WH_MOUSE_LL as _, Some(mouse_proc), self.hinst as _, 0);
            }
        } else {
            if !self.keyboard_hook.is_null() {
                UnhookWindowsHookEx(self.keyboard_hook);
                self.keyboard_hook = null_mut();
            }
            if !self.mouse_hook.is_null() {
                UnhookWindowsHookEx(self.mouse_hook);
                self.mouse_hook = null_mut();
            }
        }
    }

    unsafe fn apply(&mut self, source: Source) {
        match source {
            Source::Hook => {
                self.set_raw(false);
                self.set_hooks(true);
            }
            // Automatic: Raw Input here, and the poll thread alongside.
            Source::Raw | Source::Auto => {
                self.set_hooks(false);
                self.set_raw(true);
            }
            // Polling needs neither; the poll thread does the work.
            Source::Poll => {
                self.set_hooks(false);
                self.set_raw(false);
            }
        }
    }
}

/// Ask the capture thread to switch to the currently selected method.
pub fn reconfigure() {
    let thread = INPUT_THREAD.load(Ordering::SeqCst);
    if thread != 0 {
        unsafe {
            PostThreadMessageW(thread, WM_APP_RECONFIGURE, 0, 0);
        }
    }
}

/// Polling: ask Windows for the current state of every key a few hundred
/// times a second. Slower to notice a press than the other two methods (up to
/// one interval), but it registers nothing with the system.
fn poll_loop() {
    let mut held = [false; 256];
    loop {
        std::thread::sleep(std::time::Duration::from_millis(4));
        let source = current_source();
        if source != Source::Poll && source != Source::Auto {
            held = [false; 256];
            std::thread::sleep(std::time::Duration::from_millis(100));
            continue;
        }
        // Skips left/right mouse buttons and the generic Shift/Ctrl/Alt codes,
        // which duplicate the left/right ones reported further up.
        for vk in 0x04u32..0xFF {
            if vk == VK_SHIFT || vk == VK_CONTROL || vk == VK_MENU {
                continue;
            }
            let down = unsafe { GetAsyncKeyState(vk as i32) } < 0;
            if down != held[vk as usize] {
                held[vk as usize] = down;
                on_input(Source::Poll, vk, down);
            }
        }
    }
}

pub fn start() {
    std::thread::spawn(poll_loop);
    std::thread::spawn(|| unsafe {
        let hinst = GetModuleHandleW(null());

        // Raw Input needs a window to deliver to; a message-only one is enough.
        let class_name = wide("VoiceInputSink");
        let mut wc: WNDCLASSW = zeroed();
        wc.lpfnWndProc = Some(wnd_proc);
        wc.hInstance = hinst as _;
        wc.lpszClassName = class_name.as_ptr();
        RegisterClassW(&wc);
        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            class_name.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE as HWND,
            null_mut(),
            hinst as _,
            null(),
        );

        let mut capture = Capture {
            hinst: hinst as *mut c_void,
            hwnd,
            keyboard_hook: null_mut(),
            mouse_hook: null_mut(),
        };

        // Creating the message queue before publishing the thread id means a
        // reconfigure request posted from now on is never lost.
        let mut msg: MSG = zeroed();
        INPUT_THREAD.store(GetCurrentThreadId(), Ordering::SeqCst);
        capture.apply(current_source());

        while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
            if msg.hwnd.is_null() && msg.message == WM_APP_RECONFIGURE {
                capture.apply(current_source());
                continue;
            }
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}

/// Some(true/false) when the token could be read, None when access was denied.
unsafe fn is_elevated(process: HANDLE) -> Option<bool> {
    let mut token: HANDLE = null_mut();
    if OpenProcessToken(process, TOKEN_QUERY, &mut token) == 0 {
        return None;
    }
    let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
    let mut len = 0u32;
    let ok = GetTokenInformation(
        token,
        TokenElevation,
        &mut elevation as *mut TOKEN_ELEVATION as *mut c_void,
        size_of::<TOKEN_ELEVATION>() as u32,
        &mut len,
    );
    CloseHandle(token);
    if ok == 0 { None } else { Some(elevation.TokenIsElevated != 0) }
}

pub fn foreground() -> Option<ForegroundPayload> {
    unsafe {
        let self_elevated = is_elevated(GetCurrentProcess()).unwrap_or(false);
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return Some(ForegroundPayload { self_elevated, elevated: None, exe: String::new() });
        }
        let mut buf = [0u16; 512];
        let mut len = buf.len() as u32;
        let exe = if QueryFullProcessImageNameW(process, 0, buf.as_mut_ptr(), &mut len) != 0 {
            let path = String::from_utf16_lossy(&buf[..len as usize]);
            path.rsplit('\\').next().unwrap_or("").to_string()
        } else {
            String::new()
        };
        let elevated = is_elevated(process);
        CloseHandle(process);
        Some(ForegroundPayload { self_elevated, elevated, exe })
    }
}

pub fn restart_as_admin() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe = wide(&exe.to_string_lossy());
    let verb = wide("runas");
    let result = unsafe {
        ShellExecuteW(null_mut(), verb.as_ptr(), exe.as_ptr(), null(), null(), SW_SHOWNORMAL as _)
    };
    // ShellExecute returns a value above 32 on success.
    if (result as isize) > 32 {
        Ok(())
    } else {
        Err("Windows did not start the app as administrator (the prompt may have been declined).".into())
    }
}
