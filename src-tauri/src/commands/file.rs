//! 文件读写相关命令：读取 / 写入 / 保存对话框 / 路径辅助。

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// 前端读取文件后拿到的数据。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePayload {
    pub path: String,
    pub content: String,
    pub modified_at: u64,
    pub size: u64,
}

/// 校验并规范化用户传入的路径，拒绝空路径与含 NUL 的路径。
pub fn validate_path(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty() {
        return Err("路径为空".to_string());
    }
    if path.contains('\0') {
        return Err("非法路径".to_string());
    }
    Ok(PathBuf::from(path))
}

/// 取文件的最后修改时间（Unix 毫秒）。
pub fn modified_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 将字节解码为文本：
/// 1. UTF-8 BOM / UTF-16 LE / UTF-16 BE BOM 优先识别；
/// 2. 否则按 UTF-8 解析，非法字节用替换字符兜底，保证不丢内容。
fn decode_text(bytes: &[u8]) -> String {
    if bytes.len() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF {
        return String::from_utf8_lossy(&bytes[3..]).into_owned();
    }
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    String::from_utf8_lossy(bytes).into_owned()
}

#[tauri::command]
pub async fn read_markdown_file(path: String) -> Result<FilePayload, String> {
    let p = validate_path(&path)?;
    let meta = std::fs::metadata(&p).map_err(|e| format!("无法读取文件信息: {e}"))?;
    if meta.is_dir() {
        return Err("目标是文件夹，无法作为文档打开".to_string());
    }
    let bytes = std::fs::read(&p).map_err(|e| format!("读取文件失败: {e}"))?;
    Ok(FilePayload {
        path: p.to_string_lossy().to_string(),
        content: decode_text(&bytes),
        modified_at: modified_ms(&meta),
        size: meta.len(),
    })
}

/// 写入文件，UTF-8 无 BOM。返回写入后的修改时间（毫秒）供前端刷新基线。
#[tauri::command]
pub async fn write_markdown_file(path: String, content: String) -> Result<u64, String> {
    let p = validate_path(&path)?;
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
    }
    std::fs::write(&p, content.as_bytes()).map_err(|e| format!("写入文件失败: {e}"))?;
    let meta = std::fs::metadata(&p).map_err(|e| format!("读取文件信息失败: {e}"))?;
    Ok(modified_ms(&meta))
}

/// 弹出「另存为」系统对话框。前端负责把返回值写入文件。
#[tauri::command]
pub async fn save_file_dialog(
    app: tauri::AppHandle,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let mut builder = app
        .dialog()
        .file()
        .set_title("另存为")
        .add_filter("Markdown 文件", &["md", "markdown", "mdown"])
        .add_filter("文本文件", &["txt"])
        .add_filter("所有文件", &["*"]);

    if let Some(dp) = default_path.filter(|s| !s.is_empty()) {
        let path = PathBuf::from(&dp);
        if let Some(dir) = path.parent().and_then(|d| d.to_str()) {
            if !dir.is_empty() {
                builder = builder.set_directory(dir);
            }
        }
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            builder = builder.set_file_name(name);
        }
    }

    let (tx, rx) = std::sync::mpsc::channel();
    builder.save_file(move |file| {
        let _ = tx.send(file);
    });
    match rx.recv() {
        Ok(Some(file)) => {
            let p = file
                .into_path()
                .map_err(|e| format!("无效的保存路径: {e}"))?;
            Ok(Some(p.to_string_lossy().to_string()))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(format!("保存对话框失败: {e}")),
    }
}

/// 判断路径是否存在（用于最近文件失效检测 / 图片解析）。
#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    let p = validate_path(&path)?;
    Ok(p.exists())
}

/// 读取任意文件并返回 base64（导出 HTML 时内联图片使用）。
#[tauri::command]
pub async fn read_file_as_base64(path: String) -> Result<String, String> {
    let p = validate_path(&path)?;
    let bytes = std::fs::read(&p).map_err(|e| format!("读取失败: {e}"))?;
    Ok(base64_encode(&bytes))
}

const B64_TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// 无依赖 base64 编码（标准字母表，带 padding）。
fn base64_encode(input: &[u8]) -> String {
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(B64_TABLE[(n >> 18) as usize & 63] as char);
        out.push(B64_TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            B64_TABLE[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            B64_TABLE[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

/// 解码标准 base64（接受换行/空白，忽略非法字符）。
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let cleaned: Vec<u8> = input
        .bytes()
        .filter(|b| !b.is_ascii_whitespace())
        .collect();
    if cleaned.len() % 4 != 0 {
        return Err("base64 长度非法".to_string());
    }
    let value_of = |b: u8| -> Option<u32> {
        match b {
            b'A'..=b'Z' => Some((b - b'A') as u32),
            b'a'..=b'z' => Some((b - b'a') as u32 + 26),
            b'0'..=b'9' => Some((b - b'0') as u32 + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    };
    let mut out = Vec::with_capacity(cleaned.len() / 4 * 3);
    for chunk in cleaned.chunks(4) {
        let mut n: u32 = 0;
        let mut pad = 0;
        for (i, &b) in chunk.iter().enumerate() {
            if b == b'=' {
                pad += 1;
                n <<= 6;
                continue;
            }
            let v = value_of(b).ok_or_else(|| "base64 含非法字符".to_string())?;
            n = (n << 6) | v;
            let _ = i;
        }
        out.push((n >> 16) as u8);
        if pad < 2 {
            out.push((n >> 8) as u8);
        }
        if pad < 1 {
            out.push(n as u8);
        }
    }
    Ok(out)
}

/// 写入二进制文件（导出 PNG / DOCX 使用），内容以 base64 传输。
#[tauri::command]
pub async fn write_binary_file(path: String, base64: String) -> Result<u64, String> {
    let p = validate_path(&path)?;
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
    }
    let bytes = base64_decode(&base64)?;
    std::fs::write(&p, &bytes).map_err(|e| format!("写入文件失败: {e}"))?;
    Ok(bytes.len() as u64)
}

/// 供其它模块复用的路径父目录提取。
pub fn parent_dir(path: &str) -> Result<PathBuf, String> {
    let p = validate_path(path)?;
    p.parent()
        .filter(|d| !d.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .ok_or_else(|| "无法确定文件所在目录".to_string())
}
