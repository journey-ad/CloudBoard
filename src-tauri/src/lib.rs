// this hides the console for Windows release builds
#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use serde::Serialize;
use std::sync::Mutex;
use tauri::{
  // state is used in Linux
  self,
  Emitter,
  Manager,
};
use tauri_plugin_store;
use tauri_plugin_window_state;
use tauri_plugin_autostart::MacosLauncher;

mod tray_icon;
mod utils;

use tray_icon::{create_tray_icon, update_tray, update_tray_tooltip, set_sync_state, SyncState};
// use utils::long_running_thread;
use utils::get_mime_type;

#[macro_use]
extern crate rust_i18n;
rust_i18n::i18n!("locales");

#[derive(Clone, Serialize)]
struct SingleInstancePayload {
  args: Vec<String>,
  cwd: String,
}

// #[derive(Debug, Default, Serialize)]
// struct Example<'a> {
//   #[serde(rename = "Attribute 1")]
//   attribute_1: &'a str,
// }

#[cfg(target_os = "linux")]
pub struct DbusState(Mutex<Option<dbus::blocking::SyncConnection>>);

#[tauri::command]
fn process_file(filepath: String) -> String {
  println!("Processing file: {}", filepath);
  "Hello from Rust!".into()
}

#[cfg(target_os = "linux")]
fn webkit_hidpi_workaround() {
  // See: https://github.com/spacedriveapp/spacedrive/issues/1512#issuecomment-1758550164
  std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
}

fn main_prelude() {
  #[cfg(target_os = "linux")]
  webkit_hidpi_workaround();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  main_prelude();
  // main window should be invisible to allow either the setup delay or the plugin to show the window
  tauri::Builder::default()
    .plugin(tauri_plugin_clipboard::init())
    .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--flag1", "--flag2"]) /* arbitrary number of args to pass to your app */))
    .plugin(tauri_plugin_log::Builder::new().build())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_fs::init())
    // custom commands
    .invoke_handler(tauri::generate_handler![update_tray, update_tray_tooltip, set_sync_state, process_file, get_mime_type])
    // allow only one instance and propagate args and cwd to existing instance
    .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
      app
        .emit("newInstance", SingleInstancePayload { args, cwd })
        .unwrap();
    }))
    // persistent storage with filesystem
    .plugin(tauri_plugin_store::Builder::default().build())
    // save window position and size between sessions
    // if you remove this, make sure to uncomment the mainWebview?.show line in TauriProvider.tsx
    .plugin(tauri_plugin_window_state::Builder::default().build())
    // custom setup code
    .setup(|app| {
      let _ = create_tray_icon(app.handle());
      app.manage(Mutex::new(SyncState::Running));

      let app_handle = app.handle().clone();
      update_tray(app_handle, "en_US".to_string(), "light".to_string());

      // let app_handle = app.handle().clone();
      // tauri::async_runtime::spawn(async move { long_running_thread(&app_handle).await });

      #[cfg(target_os = "linux")]
      app.manage(DbusState(Mutex::new(
        dbus::blocking::SyncConnection::new_session().ok(),
      )));

      // TODO: AUTOSTART
      // FOLLOW: https://v2.tauri.app/plugin/autostart/

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

// useful crates
// https://crates.io/crates/directories for getting common directories

// TODO: optimize permissions
// TODO: decorations false and use custom title bar

// #[tauri::command] 
// fn handle_window_close_event(app: tauri::AppHandle) {
//   if let Some(window) = app.get_webview_window("main") {
//     window.hide().unwrap();
//   }
// }
