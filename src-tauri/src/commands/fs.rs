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

/* ------------------------------------------------------------------ */
/* 跨文件代码符号检索（零配置转到定义 & 查找所有引用）                    */
/* ------------------------------------------------------------------ */

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SnippetLine {
    pub line: usize,
    pub text: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCodeMatch {
    pub path: String,
    pub file_name: String,
    /// 1-based 行号
    pub line: usize,
    /// 1-based 列号
    pub col: usize,
    pub line_text: String,
    /// "function" | "method" | "class" | "type" | "variable" | "reference"
    pub kind: String,
    pub is_definition: bool,
    pub preview_lines: Vec<SnippetLine>,
}

const CODE_EXTS: &[&str] = &[
    "rs", "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "c", "h", "cpp", "hpp", "cc",
    "cxx", "hh", "java", "cs", "php", "swift", "kt", "kts", "dart", "scala", "rb", "sql",
    "lua", "sh", "ps1", "vue", "svelte",
];

const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    "__pycache__",
    ".venv",
    "venv",
    ".idea",
    ".vscode",
    "vendor",
    "bin",
    "obj",
];

fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}

/// 在一行文本中查找全词匹配的 symbol，返回首个匹配的字节偏移
fn find_whole_word(line: &str, symbol: &str) -> Option<usize> {
    if symbol.is_empty() || line.len() < symbol.len() {
        return None;
    }
    let bytes = line.as_bytes();
    let mut start = 0;
    while let Some(pos) = line[start..].find(symbol) {
        let idx = start + pos;
        let end = idx + symbol.len();
        let prev_ok = idx == 0 || !is_ident_byte(bytes[idx - 1]);
        let next_ok = end >= bytes.len() || !is_ident_byte(bytes[end]);
        if prev_ok && next_ok {
            return Some(idx);
        }
        start = idx + 1;
    }
    None
}

/// 判断包含 symbol 的代码行是否为函数/类型/变量定义，返回其定义类别
fn classify_definition_line(trimmed: &str, symbol: &str, pos_in_trimmed: usize) -> Option<&'static str> {
    // 跳过单行注释
    if trimmed.starts_with("//")
        || trimmed.starts_with('#') && !trimmed.starts_with("#define")
        || trimmed.starts_with("/*")
        || trimmed.starts_with('*')
        || trimmed.starts_with("--")
    {
        return None;
    }

    let before = trimmed[..pos_in_trimmed].trim_end();
    let after = trimmed[pos_in_trimmed + symbol.len()..].trim_start();

    // 1. 排除点号或成员访问（如 obj.foo()、ptr->foo()、::foo() 调用）
    if before.ends_with('.') || before.ends_with("->") {
        return None;
    }

    // 2. 显式关键字定义前缀（跨语言通用）
    let last_token = before
        .rsplit(|c: char| !c.is_ascii_alphanumeric() && c != '_')
        .find(|s| !s.is_empty())
        .unwrap_or("");

    match last_token {
        "fn" | "def" | "func" | "function" | "sub" => return Some("function"),
        "class" | "struct" | "interface" | "trait" | "impl" | "enum" | "record" | "protocol" => {
            return Some("class")
        }
        "type" | "typedef" | "namespace" | "module" | "mod" => return Some("type"),
        "define" if before.starts_with("#") => return Some("function"),
        "const" | "let" | "var" | "static" | "val" => {
            if after.starts_with('=') || after.starts_with(':') {
                // 判断是否为箭头函数或函数表达式
                if after.contains("=>") || after.contains("function") {
                    return Some("function");
                }
                return Some("variable");
            }
        }
        _ => {}
    }

    // 3. Go 接收器方法：`func (r *Repo) Symbol(`
    if trimmed.starts_with("func ") && before.ends_with(')') && after.starts_with('(') {
        return Some("method");
    }

    // 4. C / C++ / Java / C# / TS / JS 类方法或函数声明：`[修饰符/返回类型] symbol(...) {`
    if after.starts_with('(') || after.starts_with('<') {
        // 排除常见控制流与调用语句前缀
        if matches!(
            last_token,
            "if" | "for" | "while" | "switch" | "catch" | "return" | "throw" | "new" | "await" | "yield" | "else" | "case" | "sizeof" | "typeof" | "delete"
        ) {
            return None;
        }
        // 排除赋值调用 `x = foo(...)` 或参数内部调用 `bar(foo(...))`
        if before.contains('=') || before.contains('(') || before.ends_with(',') || before.ends_with('!') {
            return None;
        }
        // 行尾通常有 `{` 或 `:` 或多行参数列表（不能是普通语句 `;` 结尾，除非是头文件声明）
        let clean_line = trimmed.split("//").next().unwrap_or(trimmed).trim_end();
        if clean_line.ends_with('{') || clean_line.ends_with(") {") || clean_line.ends_with("){") {
            // 有返回类型或修饰符，或行首直接是方法名（TS/JS class method）
            if !before.is_empty() || after.contains(")") {
                return Some(if before.is_empty() { "method" } else { "function" });
            }
        }
    }

    None
}

/// 向上寻找最近的工程根目录（存在 .git / package.json / Cargo.toml / pyproject.toml / go.mod），最多向上退 2 层
fn resolve_scan_root(start: &Path) -> PathBuf {
    let base_dir = if start.is_dir() {
        start.to_path_buf()
    } else {
        start.parent().map(Path::to_path_buf).unwrap_or_else(|| start.to_path_buf())
    };
    let markers = [".git", "package.json", "Cargo.toml", "pyproject.toml", "go.mod", "pom.xml", "CMakeLists.txt"];
    let mut cur = base_dir.as_path();
    for _ in 0..3 {
        for m in markers {
            if cur.join(m).exists() {
                return cur.to_path_buf();
            }
        }
        if let Some(p) = cur.parent() {
            if !p.as_os_str().is_empty() {
                cur = p;
                continue;
            }
        }
        break;
    }
    base_dir
}

/// 收集工程目录下的源码文件（广度优先，限制最多 1200 个源码文件，单文件 <= 2MB）
fn collect_source_files(root: &Path, max_files: usize) -> Vec<PathBuf> {
    let mut result = Vec::new();
    let mut queue = std::collections::VecDeque::new();
    queue.push_back((root.to_path_buf(), 0usize));

    while let Some((dir, depth)) = queue.pop_front() {
        if result.len() >= max_files || depth > 6 {
            break;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if result.len() >= max_files {
                break;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let path = entry.path();
            let Ok(ft) = entry.file_type() else {
                continue;
            };
            if ft.is_dir() {
                if !IGNORED_DIRS.iter().any(|&ig| ig.eq_ignore_ascii_case(&name)) {
                    queue.push_back((path, depth + 1));
                }
            } else if ft.is_file() {
                let ext = lower_ext(&name);
                if CODE_EXTS.contains(&ext.as_str()) {
                    if let Ok(meta) = entry.metadata() {
                        if meta.len() <= 2 * 1024 * 1024 {
                            result.push(path);
                        }
                    }
                }
            }
        }
    }
    result
}

/// 在工作区目录中极速检索符号定义（mode = "defs"）或全部引用（mode = "refs"）
#[tauri::command]
pub async fn search_workspace_symbols(
    dir_path: String,
    symbol: String,
    mode: String,
) -> Result<Vec<WorkspaceCodeMatch>, String> {
    let sym = symbol.trim().to_string();
    if sym.len() < 2 {
        return Ok(Vec::new());
    }
    let start_path = validate_path(&dir_path)?;
    let root = resolve_scan_root(&start_path);
    let only_defs = mode != "refs";
    let max_matches = if only_defs { 50 } else { 250 };

    let files = collect_source_files(&root, 1200);
    let mut matches = Vec::new();

    for file_path in files {
        if matches.len() >= max_matches {
            break;
        }
        let Ok(bytes) = std::fs::read(&file_path) else {
            continue;
        };
        let content = String::from_utf8_lossy(&bytes);
        // 快速初筛：不包含该子串的文件直接跳过
        if !content.contains(&sym) {
            continue;
        }

        let lines: Vec<&str> = content.lines().collect();
        let file_name = file_path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let path_str = file_path.to_string_lossy().to_string();

        for (idx, &raw_line) in lines.iter().enumerate() {
            if matches.len() >= max_matches {
                break;
            }
            let Some(byte_col) = find_whole_word(raw_line, &sym) else {
                continue;
            };
            let trimmed = raw_line.trim();
            let def_kind = find_whole_word(trimmed, &sym)
                .and_then(|pos| classify_definition_line(trimmed, &sym, pos));

            let is_def = def_kind.is_some();
            if only_defs && !is_def {
                continue;
            }

            let mut preview_lines = Vec::new();
            if is_def {
                let start_line = idx.saturating_sub(3);
                let end_line = (idx + 14).min(lines.len());
                for (p_idx, &p_line) in lines[start_line..end_line].iter().enumerate() {
                    preview_lines.push(SnippetLine {
                        line: start_line + p_idx + 1,
                        text: p_line.chars().take(180).collect(),
                    });
                }
            }

            let col = raw_line[..byte_col].chars().count() + 1;
            matches.push(WorkspaceCodeMatch {
                path: path_str.clone(),
                file_name: file_name.clone(),
                line: idx + 1,
                col,
                line_text: trimmed.chars().take(180).collect(),
                kind: def_kind.unwrap_or("reference").to_string(),
                is_definition: is_def,
                preview_lines,
            });
        }
    }

    // 定义排在前面
    matches.sort_by(|a, b| b.is_definition.cmp(&a.is_definition));
    Ok(matches)
}
