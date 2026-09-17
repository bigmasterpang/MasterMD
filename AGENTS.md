# AGENTS.md — mastermd 项目约定

## 项目概况

Windows Markdown 查看与简易编辑器。技术栈：Tauri 2 + Rust + React 19 + TypeScript + Vite + TailwindCSS 4 + CodeMirror 6。
仓库：https://github.com/bigmasterpang/MasterMD

## 开发与校验命令

```bash
pnpm install                              # 安装依赖
pnpm typecheck                            # TypeScript 类型检查（提交前必须通过）
pnpm build                                # 仅构建前端
pnpm tauri dev                            # 开发运行
pnpm tauri build                          # 打包（NSIS 安装包）
```

Rust 侧：`cd src-tauri && cargo check --message-format=short`

国内网络需要代理：`$env:HTTP_PROXY="http://127.0.0.1:7890"; $env:HTTPS_PROXY="http://127.0.0.1:7890"`（npm/pnpm 与 ~/.cargo/config.toml 已配置）。

## 提交与发布约定

- 版本号同步修改三处：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`
- 打包产物：`src-tauri/target/release/mastermd.exe` 与 `src-tauri/target/release/bundle/nsis/mastermd_<版本>_x64-setup.exe`
- 仅在用户明确要求时才执行 git commit / push
- 推送目标：`https://github.com/bigmasterpang/MasterMD`（凭据已存于 git credential store）
- GitHub Release 通过 REST API 创建，Token 位于 `C:\opencode\github_tokens`（**禁止**写入仓库或输出到日志）

## 完成后必须发送微信通知

任务完成后，使用公共脚本发送微信通知（内容需精炼，100~200 字，3~5 条要点，详见 `C:\opencode\tools\wx-notify.md`）：

```powershell
# 中文内容先写入 UTF-8 文件，再用 -Encoding UTF8 读回，避免乱码
$content = Get-Content -LiteralPath "<utf8 内容文件>" -Raw -Encoding UTF8
& "C:\opencode\tools\send-wechat.ps1" `
    -Title "mastermd vX.Y.Z 已完成" `
    -Content $content.Trim() `
    -Url "https://github.com/bigmasterpang/MasterMD/releases"
```

通知内容规范：

- 第一行写安装包/模块名称，中间用数字序号列出 3~5 条核心改动，最后一行引导「点击卡片查看完整日志」
- 严禁塞入完整 SHA256、多行 commit 日志、长篇 Markdown
- 卡片正文不超过 350 字（脚本会自动截断收尾）

### 发布脚本编码陷阱（务必遵守）

PowerShell 5.1 会把 **无 BOM 的 UTF-8 脚本按 GBK 解析**：脚本里的中文注释可能吞掉行尾换行，导致下一行代码被并入注释而静默失效（曾导致 Release 资产名错误）。因此：

- 发布用 `.ps1` 脚本**只用 ASCII 注释**；中文说明一律写入单独的 UTF-8 文件后用 `-Encoding UTF8` 读取
- 必须含中文的脚本要用「UTF-8 with BOM」保存
- 上传 Release 资产前先确认本地文件名与 `?name=` 参数一致，传完用 API 复核 `releases/latest` 的资产名

## 代码约定

- TypeScript strict；函数组件 + Hooks；全局状态用 Zustand；不使用大型 UI 库
- 关键逻辑写中文注释；仅在必要时新增依赖，优先选择体积更小、行为更稳定的方案
- 前端产物通过 Vite 代码分割按需加载（KaTeX / Mermaid / highlight.js 语言包）
