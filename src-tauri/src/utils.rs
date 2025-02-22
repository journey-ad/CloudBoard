use serde::Serialize;
use std::time::Duration;
// State is used by linux
use tauri::{Emitter, Manager};
#[derive(Clone, Serialize)]
struct LongRunningThreadStruct {
  message: String,
}

pub async fn long_running_thread(app: &tauri::AppHandle) {
  loop {
    // sleep
    tokio::time::sleep(Duration::from_secs(2)).await;
    let _ = app.get_webview_window("main").and_then(|w| {
      w.emit(
        "longRunningThread",
        LongRunningThreadStruct {
          message: "LRT Message".into(),
        },
      )
      .ok()
    });
  }
}

#[tauri::command]
pub fn get_mime_type(path: String) -> Result<(String, String), String> {
  match infer::get_from_path(&path) {
    Ok(Some(kind)) => Ok((kind.mime_type().to_string(), kind.extension().to_string())),
    Ok(None) => Ok(("application/octet-stream".to_string(), "bin".to_string())),
    Err(e) => Err(e.to_string())
  }
}
