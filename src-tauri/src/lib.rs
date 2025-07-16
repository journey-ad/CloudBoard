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
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

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

#[tauri::command]
async fn enable_autostart(app: tauri::AppHandle) -> Result<(), String> {
  let autostart_manager = app.autolaunch();
  autostart_manager.enable().map_err(|e| e.to_string())
}

#[tauri::command]
async fn disable_autostart(app: tauri::AppHandle) -> Result<(), String> {
  let autostart_manager = app.autolaunch();
  autostart_manager.disable().map_err(|e| e.to_string())
}

#[tauri::command]
async fn is_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
  let autostart_manager = app.autolaunch();
  autostart_manager.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
  if let Some(window) = app.get_webview_window("main") {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
  }
  Ok(())
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
  
  // 检查启动参数
  let args: Vec<String> = std::env::args().collect();
  let is_hidden = args.iter().any(|arg| arg == "--hidden");
  
  let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_clipboard::init())
    .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"]) /* hidden startup flag */))
    .plugin(tauri_plugin_log::Builder::new().build())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_fs::init())
    // custom commands
    .invoke_handler(tauri::generate_handler![
      update_tray, 
      update_tray_tooltip, 
      set_sync_state, 
      process_file, 
      get_mime_type,
      enable_autostart,
      disable_autostart,
      is_autostart_enabled,
      show_main_window
    ])
    // allow only one instance and propagate args and cwd to existing instance
    .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
      // 当已有实例运行时，新实例启动会触发此回调
      let is_hidden = args.iter().any(|arg| arg == "--hidden");
      
      if !is_hidden {
        // 非隐藏启动，显示并聚焦窗口
        if let Some(window) = app.get_webview_window("main") {
          let _ = window.show();
          let _ = window.set_focus();
        }
      }
      
      app
        .emit("newInstance", SingleInstancePayload { args, cwd })
        .unwrap();
    }))
    // persistent storage with filesystem
    .plugin(tauri_plugin_store::Builder::default().build());
    
  // 只有在非隐藏模式下才加载window_state插件
  if !is_hidden {
    builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
  }
  
  builder
    // custom setup code
    .setup(|app| {
      let _ = create_tray_icon(app.handle());
      app.manage(Mutex::new(SyncState::Running));

      let app_handle = app.handle().clone();
      update_tray(app_handle, "en_US".to_string(), "light".to_string());

      // 检查启动参数来决定是否显示窗口
      let args: Vec<String> = std::env::args().collect();
      let is_hidden = args.iter().any(|arg| arg == "--hidden");
      
      if !is_hidden {
        // 非隐藏启动：显示窗口
        if let Some(window) = app.get_webview_window("main") {
          let _ = window.show();
          let _ = window.set_focus();
        }
      }

      #[cfg(target_os = "linux")]
      app.manage(DbusState(Mutex::new(
        dbus::blocking::SyncConnection::new_session().ok(),
      )));

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
