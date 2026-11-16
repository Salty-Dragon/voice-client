//! Desktop shell. The UI and all audio live in the WebView; this side owns
//! system-wide key capture, the administrator checks, the tray icon and the
//! updater plugin.

mod input;

use std::sync::atomic::{AtomicBool, Ordering};

use input::{Binding, Source};
use tauri::Manager;

/// Set from Settings: closing the window hides it and voice keeps running.
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
/// Set by the tray's Quit, so that close really closes.
static QUITTING: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn set_bindings(bindings: Vec<Binding>) {
    input::set_bindings(bindings);
}

#[tauri::command]
fn set_source(source: Source) {
    input::set_source(source);
}

#[tauri::command]
fn capture_next() {
    input::capture_next();
}

#[tauri::command]
fn restart_as_admin(app: tauri::AppHandle) -> Result<(), String> {
    input::restart_as_admin()?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Closes the window the normal way, so the page shuts its connections and
/// the player leaves voice at once, as with the window's own close button.
fn quit(app: &tauri::AppHandle) {
    QUITTING.store(true, Ordering::Relaxed);
    match app.get_webview_window("main") {
        Some(window) => {
            let _ = window.close();
        }
        None => app.exit(0),
    }
}

/// Tray icon: a left click brings the window back, the menu offers Open and Quit.
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let name = app
        .config()
        .product_name
        .clone()
        .unwrap_or_else(|| String::from("Voice"));
    let open = MenuItem::with_id(app, "open", format!("Open {name}"), true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit_item])?;

    let mut tray = TrayIconBuilder::new()
        .tooltip(&name)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub fn run() {
    let mut context = tauri::generate_context!();
    // WebView2 apps normally accept extra browser switches through this
    // variable. Because this app sets switches of its own, the variable is
    // otherwise ignored here, so add it explicitly. The automated test of the
    // installed app depends on it (debugging link, generated microphone).
    if let Ok(extra) = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") {
        for window in context.config_mut().app.windows.iter_mut() {
            let own = window.additional_browser_args.clone().unwrap_or_default();
            window.additional_browser_args = Some(format!("{own} {extra}").trim().to_string());
        }
    }

    tauri::Builder::default()
        // Must be registered first. A second launch (for example the browser
        // handing a sign-in link back) passes its arguments to the running
        // app and exits; the deep-link plugin then delivers the link.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            input::start(app.handle().clone());
            // The app is usable without a tray icon, so a failure here is not fatal.
            if let Err(e) = build_tray(app) {
                eprintln!("tray icon: {e}");
            }
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if CLOSE_TO_TRAY.load(Ordering::Relaxed) && !QUITTING.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_bindings,
            set_source,
            capture_next,
            restart_as_admin,
            set_close_to_tray
        ])
        .run(context)
        .expect("failed to start the app");
}
