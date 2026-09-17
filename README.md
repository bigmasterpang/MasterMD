# mdview — Windows Markdown 查看与简易编辑器

基于 **Tauri 2 + Rust + React 19 + TypeScript + Vite + TailwindCSS 4 + CodeMirror 6** 的 Windows 桌面 Markdown 查看器与轻量编辑器。安装包体积小、冷启动快、界面现代，支持深色/浅色主题。

## 功能一览

### 查看（P0）

- 打开方式：工具栏按钮、`Ctrl+O`、拖放文件到窗口、双击关联文件（安装包注册 `.md` / `.markdown` / `.mdown`）
- GFM 渲染：标题、段落、粗体/斜体/删除线、有序/无序/嵌套列表、任务列表、表格、引用块、代码块、链接与自动链接、图片、分割线、YAML front matter 元数据卡片
- 代码高亮：内置 18 种常用语言，其它语言在文档出现时按需动态加载
- 编码：UTF-8（兼容 UTF-8 BOM / UTF-16 BOM），保存为 UTF-8 无 BOM
- 大于 10MB 的文件提示并以只读方式打开

### 编辑（P0）

- CodeMirror 6 编辑器：行号、代码折叠、括号匹配、多光标、撤销历史、Markdown 语法高亮与代码块内嵌高亮
- 三种视图：预览 / 源码 / 分屏（`Ctrl+E` 循环切换）
- 分屏滚动同步（百分比映射 + 锁避免回环），预览更新 150ms 防抖
- `Ctrl+S` 保存、`Ctrl+Shift+S` 另存为、脏标记（标题与状态栏）
- 文件内搜索 `Ctrl+F`：源码模式走 CodeMirror search 扩展，预览模式高亮匹配并滚动定位

### 体验（P1）

- 大纲侧栏：h1–h6 树形结构、可折叠、点击跳转、滚动时高亮当前章节
- 文件外部变更监听：无本地修改自动重载；有本地修改弹出冲突处理（保留本地 / 加载外部 / 另存为）
- 未保存确认：关闭窗口、打开其它文件、拖入新文件前均会询问（保存 / 不保存 / 取消）
- 图片粘贴：自动保存到文档同目录 `assets/image-YYYYMMDD-HHmmss.png` 并插入相对路径
- 导出单文件 HTML：内联 CSS 与代码高亮样式，可选内联图片为 Base64
- 最近文件（最多 10 条，持久化，失效自动移除）

### 进阶（P2）

- KaTeX 数学公式（`$...$` / `$$...$$`），仅在检测到公式时动态加载
- Mermaid 图表（```mermaid 代码块），仅在检测到时动态加载，渲染失败不影响文档
- 多标签页：文件名 + 脏标记，支持关闭单个标签（中键也可）/ 关闭全部
- 配色方案：蓝 / 紫 / 绿 / 橙 / 红
- 快捷键自定义（8 个可绑定项）+ 冲突提示

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
#   src-tauri/target/release/mdview.exe
#   src-tauri/target/release/bundle/nsis/mdview_0.1.0_x64-setup.exe
```

打包配置要点（`src-tauri/tauri.conf.json`）：

- `bundle.targets = ["nsis"]`，`webviewInstallMode = downloadBootstrapper`（不内嵌 WebView2 运行时）
- `installMode = currentUser`（免管理员权限安装）
- 注册 `.md` / `.markdown` / `.mdown` 文件关联
- `fileAssociations` 配合 Rust 端 `get_startup_file`，实现双击文件直接用 mdview 打开

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
| `Ctrl+F` | 搜索 | ✅ |
| `Ctrl+W` | 关闭当前标签 | ✅ |
| `Ctrl+,` | 设置 | ✅ |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+K` | 粗体 / 斜体 / 插入链接 | ❌（编辑器内固定） |
| `Ctrl+Tab` | 切换标签页 | ❌ |
| `Ctrl +/-/0` | 字号增减 / 重置 | ❌ |
| `Esc` | 关闭搜索或弹窗 | ❌ |

## 已知问题

- 图片粘贴依赖剪贴板提供 PNG 等位图数据；从浏览器复制的 HTML 图片（无位图数据）不会触发粘贴。首次粘贴需先保存文档。
- 导出的 HTML 会内联预览区已渲染的 Mermaid SVG；KaTeX 公式的排版样式与字体不会内联（离线打开时公式会退化为纯文本符号）。
- 大文档（> 1MB）在分屏/预览模式默认关闭实时预览，需手动点击「渲染预览」；源码编辑不受影响。
- 未实现单实例运行：通过文件关联连续双击多个文件会打开多个窗口。
- 一次只能拖入并打开一个文件（拖入多个时仅打开第一个）。
- Rust 端最近文件上限固定为 10，设置中的「最近文件上限」只影响界面显示数量。

## 验收自测清单

| 项目 | 状态 |
| --- | --- |
| 打开 `.md` 并正确渲染 GFM | ✅ |
| 编辑、保存、另存为 | ✅ |
| 未保存关闭窗口有确认 | ✅ |
| 预览 / 源码 / 分屏切换 | ✅ |
| 分屏滚动同步 | ✅ |
| 深色 / 浅色 / 跟随系统 | ✅ |
| `Ctrl+F` 搜索并高亮 | ✅ |
| 最近文件持久化 | ✅ |
| 拖放打开 | ✅ |
| 代码块语法高亮 | ✅ |
| 外部修改自动重载 / 冲突提示 | ✅ |
| YAML front matter / 图片粘贴 / 导出 HTML | ✅ |
| KaTeX / Mermaid 延迟加载 | ✅ |
| 多标签页 / 配色方案 / 快捷键自定义 | ✅ |
