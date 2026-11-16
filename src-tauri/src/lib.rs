//! Desktop shell. The UI and all audio live in the WebView; this side owns
//! system-wide key capture and the administrator checks.

mod input;

use input::{Binding, Source};

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

pub fn run() {
    tauri::Builder::default()
        // Must be registered first. A second launch (for example the browser
        // handing a sign-in link back) passes its arguments to the running
        // app and exits; the deep-link plugin then delivers the link.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            input::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_bindings,
            set_source,
            capture_next,
            restart_as_admin
        ])
        .run(tauri::generate_context!())
        .expect("failed to start the app");
}
