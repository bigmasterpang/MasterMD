//! 最近文件：持久化到 app config 目录下的 recent.json。

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

const LIMIT: usize = 10;

/// 常驻状态：最近文件列表 + 持久化文件位置。
pub struct RecentState {
    pub items: Mutex<Vec<String>>,
    pub file: PathBuf,
}

fn store_file(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let _ = std::fs::create_dir_all(&dir);
    dir.join("recent.json")
}

/// 应用启动时加载最近文件列表。
pub fn load(app: &AppHandle) -> RecentState {
    let file = store_file(app);
    let items = std::fs::read_to_string(&file)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
        .unwrap_or_default();
    RecentState {
        items: Mutex::new(items),
        file,
    }
}

fn persist(state: &RecentState) {
    let items = state.items.lock().map(|g| g.clone()).unwrap_or_default();
    if let Ok(json) = serde_json::to_string_pretty(&items) {
        let _ = std::fs::write(&state.file, json);
    }
}

#[tauri::command]
pub async fn get_recent_files(state: State<'_, RecentState>) -> Result<Vec<String>, String> {
    Ok(state.items.lock().map_err(|e| e.to_string())?.clone())
}

/// 追加一条最近文件（去重后置顶），返回更新后的列表。
#[tauri::command]
pub async fn add_recent_file(
    state: State<'_, RecentState>,
    path: String,
) -> Result<Vec<String>, String> {
    let mut items = state.items.lock().map_err(|e| e.to_string())?;
    items.retain(|p| !p.eq_ignore_ascii_case(&path));
    items.insert(0, path);
    items.truncate(LIMIT);
    drop(items);
    persist(&state);
    Ok(state.items.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub async fn remove_recent_file(
    state: State<'_, RecentState>,
    path: String,
) -> Result<Vec<String>, String> {
    let mut items = state.items.lock().map_err(|e| e.to_string())?;
    items.retain(|p| !p.eq_ignore_ascii_case(&path));
    drop(items);
    persist(&state);
    Ok(state.items.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub async fn clear_recent_files(state: State<'_, RecentState>) -> Result<Vec<String>, String> {
    {
        let mut items = state.items.lock().map_err(|e| e.to_string())?;
        items.clear();
    }
    persist(&state);
    Ok(vec![])
}
