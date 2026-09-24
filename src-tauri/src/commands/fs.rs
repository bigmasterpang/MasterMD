//! 目录浏览命令：供左侧「文件」树使用。

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// 目录中的一个条目（序列化为 camelCase 供前端使用）。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_at: u64,
    /// 小写扩展名，无扩展名为空串
    pub ext: String,
}

/// 简单路径校验：拒绝空路径与含 NUL 的路径（与 file.rs 的 validate_path 行为一致）。
fn validate_path(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("路径为空".to_string());
    }
    if path.contains('\0') {
        return Err("非法路径".to_string());
    }
    Ok(PathBuf::from(path))
}

/// 取最后修改时间（Unix 毫秒），与 file.rs 的 modified_ms 保持一致。
fn modified_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 提取小写扩展名：无点、点在开头（如 .gitignore）、点结尾时返回空串。
fn lower_ext(name: &str) -> String {
    match name.rfind('.') {
        Some(idx) if idx > 0 && idx + 1 < name.len() => name[idx + 1..].to_lowercase(),
        _ => String::new(),
    }
}

/// 列出目录内容（目录在前，再按名称不区分大小写排序）。
///
/// - 传入文件路径时返回其所在目录的内容（更友好，便于把当前文档定位到树中）；
/// - `show_hidden == false` 时跳过以 `.` 开头的条目；
/// - 目录不可读（如系统目录）时返回含路径的中文错误。
#[tauri::command]
pub async fn list_directory(path: String, show_hidden: bool) -> Result<Vec<DirEntry>, String> {
    let p = validate_path(&path)?;
    let meta =
        std::fs::metadata(&p).map_err(|e| format!("无法访问路径 {}: {e}", p.display()))?;
    // 目标是文件时改用其所在目录
    let dir = if meta.is_dir() {
        p
    } else {
        p.parent()
            .filter(|d| !d.as_os_str().is_empty())
            .map(Path::to_path_buf)
            .ok_or_else(|| format!("无法确定文件所在目录: {}", p.display()))?
    };

    let reader =
        std::fs::read_dir(&dir).map_err(|e| format!("无法读取目录 {}: {e}", dir.display()))?;
    let mut entries: Vec<DirEntry> = Vec::new();
    for item in reader {
        let item = item.map_err(|e| format!("读取目录 {} 失败: {e}", dir.display()))?;
        let name = item.file_name().to_string_lossy().to_string();
        if !show_hidden && name.starts_with('.') {
            continue;
        }
        let full = item.path();
        // 跟随符号链接读取目标元数据；个别条目无权限时跳过，不让整个目录失败
        let Ok(meta) = std::fs::metadata(&full) else {
            continue;
        };
        entries.push(DirEntry {
            ext: lower_ext(&name),
            name,
            path: full.to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size: if meta.is_dir() { 0 } else { meta.len() },
            modified_at: modified_ms(&meta),
        });
    }

    // 目录优先；其次按名称小写比较，最后按原字符串兜底保证顺序稳定
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(entries)
}

/// 取上级目录；根目录（如 `C:\`）或无上级时返回 None。
#[tauri::command]
pub async fn parent_dir_of(path: String) -> Result<Option<String>, String> {
    let p = validate_path(&path)?;
    Ok(p.parent()
        .filter(|d| !d.as_os_str().is_empty())
        .map(|d| d.to_string_lossy().to_string()))
}
