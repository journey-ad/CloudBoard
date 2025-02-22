use once_cell::sync::Lazy;
use serde::Serialize;
use std::sync::Mutex;
use tauri::menu::{IconMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{self, command, Emitter, Manager, Runtime};

/**
 * 托盘事件对象内容
 */
#[derive(Clone, Serialize)]
pub struct IconTrayPayload {
  message: String,
  data: Option<String>,
}

impl IconTrayPayload {
  /**
   * 创建新的 IconTrayPayload 实例
   *
   * @param message 消息内容
   * @param data 附加数据
   * @return IconTrayPayload
   */
  pub fn new(message: &str, data: Option<String>) -> IconTrayPayload {
    IconTrayPayload {
      message: message.into(),
      data: data.or(None),
    }
  }
}

/**
 * 同步状态枚举
 */
pub enum SyncState {
  Running,
  Paused,
}

/**
 * 图标类型枚举
 */
#[derive(Clone, Copy)]
enum IconType {
  SystemTray,
  Sync,
  SyncPause,
}

static TRAY_ID: &'static str = "tray-main";
static SYNC_STATE: Lazy<Mutex<SyncState>> = Lazy::new(|| Mutex::new(SyncState::Running));
static ICON_THEME: Lazy<Mutex<String>> = Lazy::new(|| Mutex::new("light".to_string()));

/**
 * 获取可见性文本
 *
 * @param app 应用句柄
 * @return String
 */
fn get_visibility_text<R: Runtime>(app: &tauri::AppHandle<R>) -> String {
  app
    .get_webview_window("main")
    .map(|w| {
      if w.is_visible().unwrap_or(true) {
        t!("Hide Window")
      } else {
        t!("Show Window")
      }
    })
    .unwrap()
    .to_string()
}

/**
 * 获取同步文本和类型
 *
 * @param sync_state 同步状态
 * @return (String, IconType)
 */
fn get_sync_text_and_type(sync_state: &SyncState) -> (String, IconType) {
  match *sync_state {
    SyncState::Running => (t!("Pause Sync").to_string(), IconType::SyncPause),
    SyncState::Paused => (t!("Resume Sync").to_string(), IconType::Sync),
  }
}

/**
 * 获取图标路径的函数
 *
 * @param icon_type 图标类型
 * @param theme 主题
 * @return &'static [u8]
 */
fn get_icon_bytes(icon_type: IconType, theme: &str) -> &'static [u8] {
  match (icon_type, theme) {
    (IconType::SystemTray, "light") => include_bytes!("../icons/system-tray-light.ico"),
    (IconType::SystemTray, "dark") => include_bytes!("../icons/system-tray-dark.ico"),
    (IconType::Sync, "light") => include_bytes!("../icons/sync-light.ico"),
    (IconType::Sync, "dark") => include_bytes!("../icons/sync-dark.ico"),
    (IconType::SyncPause, "light") => include_bytes!("../icons/sync-pause-light.ico"),
    (IconType::SyncPause, "dark") => include_bytes!("../icons/sync-pause-dark.ico"),
    // 默认图标
    _ => include_bytes!("../icons/system-tray-light.ico"),
  }
}

/**
 * 创建图标托盘菜单
 *
 * @param app 应用句柄
 * @param lang 语言设置
 * @return Result<Menu<R>, tauri::Error>
 */
pub fn create_tray_menu<R: Runtime>(
  app: &tauri::AppHandle<R>,
  lang: String,
) -> Result<Menu<R>, tauri::Error> {
  // 设置语言
  rust_i18n::set_locale(&lang);

  let sync_state = SYNC_STATE.lock().unwrap();
  let theme = ICON_THEME.lock().unwrap();

  let visibility_text = get_visibility_text(app);
  let (sync_text, sync_type) = get_sync_text_and_type(&sync_state);
  let sync_icon = get_icon_bytes(sync_type, theme.as_str());

  MenuBuilder::new(app)
    .items(&[
      &MenuItemBuilder::with_id("toggle-visibility", visibility_text).build(app)?,
      &IconMenuItemBuilder::with_id("toggle-sync", sync_text)
        .icon(tauri::image::Image::from_bytes(sync_icon).unwrap())
        .build(app)?,
      &MenuItemBuilder::with_id("quit", t!("Quit")).build(app)?,
    ])
    .build()
}

/**
 * 更新托盘菜单
 *
 * @param app 应用句柄
 * @param lang 语言设置
 */
fn update_tray_menu<R: Runtime>(app: &tauri::AppHandle<R>, lang: String) {
  if let Some(tray) = app.tray_by_id(TRAY_ID) {
    let _ = tray.set_menu(create_tray_menu(app, lang).ok());
  }
}

/**
 * 更新托盘
 *
 * @param app 应用句柄
 * @param lang 语言设置
 * @param theme 主题
 */
#[command]
pub fn update_tray<R: Runtime>(app: tauri::AppHandle<R>, lang: String, theme: String) {
  if let Some(tray) = app.tray_by_id(TRAY_ID) {
    // 更新主题
    *ICON_THEME.lock().unwrap() = theme.into();

    // 更新菜单
    update_tray_menu(&app, lang);

    // 更新图标
    let icon_bytes = get_icon_bytes(IconType::SystemTray, ICON_THEME.lock().unwrap().as_str());
    let _ = tray.set_icon(tauri::image::Image::from_bytes(icon_bytes).ok());
  }
}

/**
 * 更新托盘提示文本
 *
 * @param app 应用句柄
 * @param tooltip 提示文本
 */
#[command]
pub fn update_tray_tooltip<R: Runtime>(app: tauri::AppHandle<R>, tooltip: String) {
  if let Some(tray) = app.tray_by_id(TRAY_ID) {
    println!("update_tray_tooltip: {}", tooltip);
    let _ = tray.set_tooltip(Some(tooltip));
  }
}

/**
 * 设置同步状态
 * 
 * @param state 同步状态字符串 ("running" 或 "paused")
 */
#[command]
pub fn set_sync_state(state: String) {
    let mut sync_state = SYNC_STATE.lock().unwrap();
    *sync_state = match state.as_str() {
        "paused" => SyncState::Paused,
        _ => SyncState::Running,
    };
}

/**
 * 处理同步状态切换
 *
 * @param app 应用句柄
 * @return Option<String> 事件数据
 */
fn handle_sync_toggle<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<String> {
  // 更新同步状态
  {
    let mut sync_state = SYNC_STATE.lock().unwrap();
    *sync_state = match *sync_state {
      SyncState::Running => SyncState::Paused,
      SyncState::Paused => SyncState::Running,
    };
  }

  // 更新菜单
  let lang = rust_i18n::locale().to_string();
  update_tray_menu(app, lang);

  // 返回新状态
  let sync_state = SYNC_STATE.lock().unwrap();
  Some(match *sync_state {
    SyncState::Running => "running".to_string(),
    SyncState::Paused => "paused".to_string(),
  })
}

/**
 * 处理窗口可见性切换
 *
 * @param app 应用句柄
 * @return Option<String> 事件数据
 */
fn handle_visibility_toggle<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<String> {
  if let Some(main_window) = app.get_webview_window("main") {
    let result = if main_window.is_visible().unwrap() {
      main_window.hide().map(|_| "hidden".to_string())
    } else {
      main_window.show().map(|_| "visible".to_string())
    };

    if result.is_ok() {
      let lang = rust_i18n::locale().to_string();
      let theme = ICON_THEME.lock().unwrap().clone();
      update_tray(app.clone(), lang, theme);
      result.ok().map(Some).unwrap_or(None)
    } else {
      None
    }
  } else {
    None
  }
}

/**
 * 处理托盘菜单事件
 *
 * @param app 应用句柄
 * @param event_id 事件ID
 * @return Option<String> 事件数据
 */
fn handle_menu_event<R: Runtime>(app: &tauri::AppHandle<R>, event_id: &str) -> Option<String> {
  match event_id {
    "quit" => {
      std::process::exit(0);
    }
    "toggle-sync" => handle_sync_toggle(app),
    "toggle-visibility" => handle_visibility_toggle(app),
    _ => None,
  }
}

/**
 * 发送托盘事件到主窗口
 *
 * @param app 应用句柄
 * @param event_id 事件ID
 * @param event_data 事件数据
 */
fn emit_tray_event<R: Runtime>(
  app: &tauri::AppHandle<R>,
  event_id: &str,
  event_data: Option<String>,
) {
  if let Some(main_window) = app.get_webview_window("main") {
    let _ = main_window.emit("systemTray", IconTrayPayload::new(event_id, event_data));
  }
}

/**
 * 创建托盘图标
 *
 * @param app 应用句柄
 * @return Result<TrayIcon, tauri::Error>
 */
pub fn create_tray_icon(app: &tauri::AppHandle) -> Result<TrayIcon, tauri::Error> {
  TrayIconBuilder::with_id(TRAY_ID)
    .tooltip(t!("CloudBoard"))
    .menu_on_left_click(false)
    .menu(&create_tray_menu(app, "en_US".into())?)
    .on_menu_event(move |app, event| {
      let event_id = event.id().as_ref();
      let event_data = handle_menu_event(&app, event_id);
      emit_tray_event(&app, event_id, event_data);
    })
    .on_tray_icon_event(|tray, event| {
      let app = tray.app_handle();
      match event {
        TrayIconEvent::Click {
          button: MouseButton::Left,
          button_state: MouseButtonState::Up,
          ..
        } => {
          if let Some(main_window) = app.get_webview_window("main") {
            let _ = main_window.emit("system-tray", IconTrayPayload::new("left-click", None));
            let _ = main_window.show();
            let _ = main_window.set_focus();
          }
          println!("system tray received a left click");
        }
        TrayIconEvent::Click {
          button: MouseButton::Right,
          button_state: MouseButtonState::Up,
          ..
        } => {
          println!("system tray received a right click");
        }
        TrayIconEvent::DoubleClick { .. } => {
          println!("system tray received a double click");
        }
        _ => {}
      }
    })
    .build(app)
}
