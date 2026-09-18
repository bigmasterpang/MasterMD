# MasterMD — Windows Markdown 查看与编辑器

> 作者：**Master Wang（王大师）** · Master 系列软件
> 仓库：<https://github.com/bigmasterpang/MasterMD>

基于 **Tauri 2 + Rust + React 19 + TypeScript + Vite + TailwindCSS 4 + CodeMirror 6** 的 Windows 桌面 Markdown 查看器与轻量编辑器。安装包约 4.2 MB，冷启动 < 0.4 秒，空闲内存约 30 MB。

## 功能一览

### 查看（P0）

- 打开方式：工具栏按钮、`Ctrl+O`、拖放文件到窗口、双击关联文件（安装包注册 `.md` / `.markdown` / `.mdown`）
- GFM 渲染：标题、段落、粗体/斜体/删除线、有序/无序/嵌套列表、任务列表、表格、引用块、代码块、链接与自动链接、图片、分割线、YAML front matter 元数据卡片
- 扩展语法：**提示块**（`> [!NOTE] 标题`，支持 10 种类型）、**高亮 `==文字==`**、**下划线 `++文字++`**、**上标 `x^2^`**、**下标 `H~2~O`**、数学公式、Mermaid 图表
- 代码高亮：内置 18 种常用语言，其它语言在文档出现时按需动态加载
- 编码：UTF-8（兼容 UTF-8 BOM / UTF-16 BOM），保存为 UTF-8 无 BOM
- 大于 10MB 的文件提示并以只读方式打开

### 编辑（P0）

- CodeMirror 6 编辑器：行号、代码折叠、括号匹配、多光标、撤销历史、Markdown 语法高亮与代码块内嵌高亮
- 三种视图：预览 / 源码 / 分屏（`Ctrl+E` 循环切换）
- 分屏滚动同步（百分比映射 + 锁避免回环），预览更新 150ms 防抖
- `Ctrl+S` 保存、`Ctrl+Shift+S` 另存为、脏标记（标题与状态栏）

### 查找与替换（Notepad++ 风格）

- `Ctrl+F` 查找 / `Ctrl+H` 查找并替换，`F3` / `Shift+F3` 下一个、上一个
- 选项：区分大小写、全字匹配、正则表达式、`.` 匹配换行、循环查找
- **替换** / **全部替换**：源码模式走 CodeMirror 事务（可撤销），预览模式直接改写源码
- 正则替换支持 `$1` / `$&` / `$$` 反向引用；实时显示 `当前/总数`
- 编辑器内自绘匹配高亮（当前项强调色），预览区同步高亮并滚动定位

### Markdown 快捷编辑

| 分类 | 功能 | 快捷键 |
| --- | --- | --- |
| 标题 | H1–H6 / 取消标题 | `Ctrl+1`…`Ctrl+6` / `Ctrl+0` |
| 标题 | 提升 / 降低级别 | `Ctrl+Alt+↑` / `Ctrl+Alt+↓` |
| 列表 | 无序 / 有序 / 任务列表 | `Ctrl+Shift+8` / `Ctrl+Shift+7` / `Ctrl+Shift+9` |
| 块 | 引用块 | `Ctrl+Shift+Q` |
| 块 | 提示块（NOTE） | `Ctrl+Shift+L` |
| 块 | 代码块 / 表格 / 分割线 | `Ctrl+Shift+C` / `Ctrl+Shift+T` / `Ctrl+Shift+H` |
| 插入 | 图片 / 目录 (TOC) / 日期时间 | `Ctrl+Shift+I` / `Ctrl+Shift+O` |
| 行 | 上移 / 下移 / 复制 / 删除 | `Alt+↑↓` / `Shift+Alt+↑↓` / `Ctrl+Shift+K` |
| 格式 | 粗体 / 斜体 / 删除线 / 行内代码 / 链接 | `Ctrl+B` / `Ctrl+I` / `Alt+Shift+5` / `` Ctrl+` `` / `Ctrl+K` |
| 格式 | 上标 / 下标 | `Alt+Shift+=` / `Alt+Shift+-` |
| 格式 | 大小写转换 | 工具栏「格式」菜单 |

工具栏提供「标题 / 列表 / 插入 / 格式」四个下拉菜单，覆盖全部编辑命令（含提示块 5 种类型、多种表格尺寸）。

### 导出

| 格式 | 说明 |
| --- | --- |
| HTML | 单文件、内联 CSS 与代码高亮样式，可选内联图片为 Base64 |
| PNG 图片 | 2 倍像素密度离屏渲染，保留公式、Mermaid、代码高亮 |
| Word (DOCX) | 标题 / 列表 / 任务列表 / 表格 / 代码块 / 引用 / 本地图片（浏览器内生成 OOXML） |
| PDF | 调用 WebView2 PrintToPdf 直接生成，无需安装打印驱动；打印样式自动隐藏界面只留正文、强制浅色主题 |

### 右键菜单

- **编辑器**：选中文字时提供「格式 / 段落与列表 / 提示块 / 插入 / 大小写转换」二级菜单（含高亮、下划线、清除格式、提示块 5 种类型等）；空白处右键提供「插入 / 段落与列表 / 提示块」
- **预览区**：复制选中文本 / 复制全文 / 全选
- 原生右键菜单已被禁用（其中的「刷新」会重载页面导致未保存内容丢失）

### 会话恢复

- 未保存内容与打开的标签页会自动暂存，意外重载或崩溃后重新打开应用即可恢复
- 恢复时如磁盘文件已变化，仍会标注为「未保存」以便选择保存或丢弃

### 插入与交互

- 「插入」菜单含**数学公式**（行内 `$…$` / 块级 `$$…$$`）与 **Mermaid 图表**模板
- 插入链接 / 图片使用表单弹窗填写显示文字与地址，避免插入无效占位链接
- 预览区**任务列表复选框可直接点击**，勾选状态实时回写到 Markdown 源码（源码模式走 CodeMirror 事务，可撤销）

### 体验（P1）

- 大纲侧栏：h1–h6 树形结构、可折叠、点击跳转、滚动时高亮当前章节
- 文件外部变更监听：无本地修改自动重载；有本地修改弹出冲突处理（保留本地 / 加载外部 / 另存为）
- 未保存确认：关闭窗口、打开其它文件、拖入新文件前均会询问（保存 / 不保存 / 取消）
- 图片粘贴：自动保存到文档同目录 `assets/image-YYYYMMDD-HHmmss.png` 并插入相对路径
- 最近文件（最多 10 条，持久化，失效自动移除）
- 状态栏统计：**原始字数**（源码字符数）、**预览字数**（渲染后可见字符数）、词数、行数、文件大小、编码、视图模式

### 进阶（P2）

- KaTeX 数学公式（`$...$` / `$$...$$`），仅在检测到公式时动态加载
- Mermaid 图表（```mermaid 代码块），仅在检测到时动态加载，渲染失败不影响文档
- 多标签页：文件名 + 脏标记，支持关闭单个标签（中键也可）/ 关闭全部
- 配色方案：蓝 / 紫 / 绿 / 橙 / 红
- 快捷键自定义（9 个可绑定项）+ 冲突提示
- **内置在线更新**：启动自动检查、应用内下载安装（详见下文）

## 内置在线更新

mastermd 已接入「大胖软件中心」（双节点热备分发），支持**在应用内直接下载并安装新版本**。

| 环节 | 实现 |
| --- | --- |
| 版本查询 | `GET {节点}/api/apps/mastermd/windows/latest`，主站 `https://master.dapang.wang` 失败自动回退国内节点 `http://106.14.225.57` |
| 版本比对 | 语义化逐位比较（`0.4.0` 与 `0.3.10` 不会误判） |
| 下载 | Rust 侧 WinHTTP 流式下载到临时目录，实时进度事件 `update-progress`（不引入第三方 HTTP 库） |
| 校验 | 下载过程中增量计算 SHA-256，与接口返回的 `sha256` 严格比对，不匹配自动删除临时文件 |
| 安装 | 校验通过后自动拉起 NSIS 安装程序，按向导完成安装 |
| 兜底 | 软件中心不可用时回退 GitHub Release（仅跳转发布页） |
| 时机 | 启动 2.5 秒后静默检查（可在设置中关闭），状态栏提示新版本，设置页可手动检查 |

门户接口未开启 CORS，因此查询与下载统一走 Rust/WinHTTP，而非 WebView 的 fetch。

### 发布到软件中心

项目内置发布脚本（调用 `C:\opencode\tools\publish-release.ps1` 推送双节点）：

```powershell
.\tools\publish.ps1                      # 使用已有安装包发布
.\tools\publish.ps1 -Build               # 先编译再发布
.\tools\publish.ps1 -NotesFilePath .\release-notes.md
```

版本号自动从 `src-tauri/tauri.conf.json` 读取，更新说明默认取最近一次 git commit。

## 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Windows | 10 1809+ / 11 x64 | 需要 WebView2 运行时（Win11 自带，Win10 由安装包引导下载） |
| Node.js | ≥ 20（开发时使用 24） | |
| pnpm | ≥ 9 | `npm i -g pnpm` |
| Rust | ≥ 1.77.2（stable） | `rustup default stable` |
| MSVC Build Tools | VS 2022，含「使用 C++ 的桌面开发」 | 提供链接器与 Windows SDK |

国内网络建议配置代理（项目开发时使用 `http://127.0.0.1:7890`）：

```powershell
npm config set proxy http://127.0.0.1:7890
npm config set https-proxy http://127.0.0.1:7890
# ~/.cargo/config.toml
# [http]
# proxy = "http://127.0.0.1:7890"
```

## 开发

```bash
pnpm install          # 安装前端依赖
pnpm tauri dev        # 启动开发环境（Vite + Tauri 窗口）
pnpm typecheck        # TypeScript 类型检查
pnpm build            # 仅构建前端（输出到 dist/）
```

## 构建与打包

```bash
pnpm tauri build              # 生成 NSIS 安装包
# 产物：
#   src-tauri/target/release/MasterMD.exe
#   src-tauri/target/release/bundle/nsis/MasterMD_0.6.0_x64-setup.exe
```

打包配置要点（`src-tauri/tauri.conf.json`）：

- `bundle.targets = ["nsis"]`，`webviewInstallMode = downloadBootstrapper`（不内嵌 WebView2 运行时）
- `installMode = currentUser`（免管理员权限安装）
- 注册 `.md` / `.markdown` / `.mdown` 文件关联
- `fileAssociations` 配合 Rust 端 `get_startup_file`，实现双击文件直接用 mastermd 打开

Rust 发布优化（`src-tauri/Cargo.toml`）：

```toml
[profile.release]
lto = true
codegen-units = 1
opt-level = "z"
panic = "abort"
strip = true
incremental = false
```

## 项目结构

```text
src/
├── components/
│   ├── Editor/       CodeMirror 6 编辑器与主题
│   ├── Preview/      Markdown 预览（KaTeX / Mermaid 延迟渲染）
│   ├── Outline/      大纲侧栏
│   ├── Toolbar/      工具栏
│   ├── StatusBar/    状态栏
│   ├── Tabs/         多标签页
│   ├── SearchBar/    文件内搜索
│   ├── Settings/     设置弹窗
│   ├── Dialogs/      未保存 / 冲突 / 确认 / 提示弹窗
│   ├── Layout/       分屏布局
│   ├── Welcome/      欢迎页（最近文件）
│   └── common/       图标与通用弹窗
├── hooks/            useMarkdown / useScrollSync / useFileWatcher / useTheme / useAutoSave / 快捷键
├── stores/           Zustand：appStore / settingsStore / dialogStore
├── utils/            markdown 渲染管线、front matter、清理、路径、导出、持久化、快捷键
└── types/            全局类型定义

src-tauri/src/
├── lib.rs            插件注册、窗口关闭拦截、启动文件参数
└── commands/
    ├── file.rs       读取 / 写入 / 另存为对话框 / base64
    ├── recent.rs     最近文件持久化
    ├── image.rs      粘贴图片落盘
    └── watch.rs      文件外部变更监听（notify）
```

## 渲染与安全管线

1. 读取文件 → 2. 剥离 YAML front matter（解析失败降级为普通文本）→ 3. `markdown-it` 渲染（`html: false`）→ 4. `DOMPurify` 清理 → 5. 注入预览容器 → 6. 修正相对图片路径（`convertFileSrc`）与链接拦截 → 7. 检测公式 / Mermaid 并按需动态加载渲染。

- 外链与相对链接均经拦截处理：`http(s)/mailto` 交给系统浏览器，相对 `.md` 链接在应用内打开
- 图片相对路径基于文档目录解析，文档未保存时显示占位提示
- 全部渲染结果先经 DOMPurify 清理，`javascript:` 等危险协议被阻断

## 快捷键

| 快捷键 | 功能 | 是否可自定义 |
| --- | --- | --- |
| `Ctrl+O` | 打开文件 | ✅ |
| `Ctrl+S` | 保存 | ✅ |
| `Ctrl+Shift+S` | 另存为 | ✅ |
| `Ctrl+N` | 新建文档 | ✅ |
| `Ctrl+E` | 切换视图模式 | ✅ |
| `Ctrl+F` | 查找 | ✅ |
| `Ctrl+H` | 查找并替换 | ✅ |
| `Ctrl+W` | 关闭当前标签 | ✅ |
| `Ctrl+,` | 设置 | ✅ |
| `F3` / `Shift+F3` | 查找下一个 / 上一个 | ❌ |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+K` | 粗体 / 斜体 / 插入链接 | ❌（编辑器内固定） |
| `Ctrl+Tab` | 切换标签页 | ❌ |
| `Ctrl +/-` | 字号增减 | ❌ |
| `Esc` | 关闭搜索或弹窗 | ❌ |

> 编辑类快捷键（标题、列表、提示块、行操作等）见上文「Markdown 快捷编辑」表格。

## 已知问题

- 图片粘贴依赖剪贴板提供 PNG 等位图数据；从浏览器复制的 HTML 图片（无位图数据）不会触发粘贴。首次粘贴需先保存文档。
- 导出的 HTML 会内联预览区已渲染的 Mermaid SVG；KaTeX 公式的排版样式与字体不会内联（离线打开时公式会退化为纯文本符号）。
- 导出 DOCX 时远程（http/https）图片不内嵌，仅保留占位文字；本地相对路径图片会内嵌。
- 导出 PDF 依赖 WebView2 的 PrintToPdf（Windows 10 1809+ 的 WebView2 均支持）。
- 大文档（> 1MB）在分屏/预览模式默认关闭实时预览，需手动点击「渲染预览」；源码编辑不受影响。导出与 PDF 打印同样需要先渲染预览。
- 未实现单实例运行：通过文件关联连续双击多个文件会打开多个窗口。
- 一次只能拖入并打开一个文件（拖入多个时仅打开第一个）。
- Rust 端最近文件上限固定为 10，设置中的「最近文件上限」只影响界面显示数量。
- 应用内更新仅支持软件中心分发（GitHub Release 仅跳转发布页）。

## 验收自测清单

| 项目 | 状态 |
| --- | --- |
| 打开 `.md` 并正确渲染 GFM | ✅ |
| 编辑、保存、另存为 | ✅ |
| 未保存关闭窗口有确认 | ✅ |
| 预览 / 源码 / 分屏切换 | ✅ |
| 分屏滚动同步 | ✅ |
| 深色 / 浅色 / 跟随系统 | ✅ |
| 查找替换：正则 / 全字 / 大小写 / 循环 / 全部替换 | ✅ |
| 提示块 / 上下标 / 表格 / 列表快捷编辑 | ✅ |
| 导出 HTML / PNG / DOCX / PDF | ✅ |
| 原始字数 / 预览字数统计 | ✅ |
| 版本更新检查（软件中心 + 应用内下载安装） | ✅ |
| 最近文件持久化 | ✅ |
| 拖放打开 | ✅ |
| 代码块语法高亮 | ✅ |
| 外部修改自动重载 / 冲突提示 | ✅ |
| YAML front matter / 图片粘贴 / 导出 HTML | ✅ |
| KaTeX / Mermaid 延迟加载 | ✅ |
| 多标签页 / 配色方案 / 快捷键自定义 | ✅ |
