#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MasterMD GitHub Release 发布脚本"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = "bigmasterpang/MasterMD"
VERSION = "0.14.0"
TAG_NAME = f"v{VERSION}"

RELEASE_NOTES = """### MasterMD v0.14.0 更新日志

1. **全新指针拖拽与跨栏分栏**：重构标签页拖拽机制为平滑轻量级 Pointer 架构，彻底解决 Windows Webview2 下原生拖放丢失与闪烁问题；支持栏内精准拖拽排序与跨栏/跨视口拖拽分栏，源栏清空时自动退回单栏模式。
2. **滚轮快速滚动切换标签**：鼠标光标悬停在标签栏上时，支持通过鼠标滚轮平滑切换相邻标签页，并自动滚动显露激活标签。
3. **空白文档纯净模式**：新建空白文档时默认非 Markdown 格式，彻底屏蔽 Markdown 视图模式切换（预览/分屏）、语法格式化工具栏与大纲目录，提供纯代码/文本源码编辑体验。
4. **同名文档智能编号标识**：打开或新建多个同名文档时，自动按顺序追加编号标识（如 README.md (1)、README.md (2)），并在标签页与窗口标题保持一致区分。
"""


def log(msg: str):
    print(f"[*] {msg}", flush=True)


def get_token() -> str:
    candidate_paths = [
        Path(r"C:\opencode\github_tokens"),
        Path.home() / ".github_token",
    ]
    for cp in candidate_paths:
        if cp.exists():
            try:
                val = cp.read_text(encoding="utf-8").strip()
                if val:
                    return val
            except Exception:
                pass
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        return token
    raise ValueError("未找到 GitHub Token")


def api_request(url: str, token: str, method: str = "GET", data=None, content_type: str = "application/json"):
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "MasterMD-Release-Script",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if content_type:
        headers["Content-Type"] = content_type

    req = urllib.request.Request(url, headers=headers, method=method)
    if data is not None:
        if isinstance(data, dict):
            req.data = json.dumps(data).encode("utf-8")
        elif isinstance(data, (bytes, bytearray)):
            req.data = data
        else:
            req.data = str(data).encode("utf-8")

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            resp_body = resp.read()
            if not resp_body:
                return None
            return json.loads(resp_body.decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} for {method} {url}: {error_body}") from e


def main():
    root_dir = Path(__file__).resolve().parent.parent
    token = get_token()

    release_dir = root_dir / "src-tauri" / "target" / "release"
    installer_path = release_dir / "bundle" / "nsis" / f"MasterMD_{VERSION}_x64-setup.exe"
    portable_path = release_dir / f"MasterMD_{VERSION}_x64.exe"

    if not portable_path.exists():
        raw_exe = release_dir / "mastermd.exe"
        if raw_exe.exists():
            portable_path.write_bytes(raw_exe.read_bytes())

    if not installer_path.exists():
        raise FileNotFoundError(f"未找到安装包: {installer_path}")
    if not portable_path.exists():
        raise FileNotFoundError(f"未找到便携版: {portable_path}")

    log(f"已就绪资产: {installer_path.name} ({installer_path.stat().st_size / 1024 / 1024:.2f} MB)")
    log(f"已就绪资产: {portable_path.name} ({portable_path.stat().st_size / 1024 / 1024:.2f} MB)")

    # 检查 Release 是否已存在
    release_tag_url = f"https://api.github.com/repos/{REPO}/releases/tags/{TAG_NAME}"
    existing_release = None
    try:
        existing_release = api_request(release_tag_url, token, method="GET")
    except RuntimeError as e:
        if "HTTP 404" not in str(e):
            raise

    if existing_release and "id" in existing_release:
        release_id = existing_release["id"]
        log(f"Release {TAG_NAME} 已存在 (ID: {release_id})，正在同步更新发布说明...")
        update_url = f"https://api.github.com/repos/{REPO}/releases/{release_id}"
        release = api_request(update_url, token, method="PATCH", data={
            "name": f"MasterMD {TAG_NAME}",
            "body": RELEASE_NOTES.strip(),
        })
    else:
        log(f"正在创建新的 GitHub Release: {TAG_NAME}...")
        create_url = f"https://api.github.com/repos/{REPO}/releases"
        release = api_request(create_url, token, method="POST", data={
            "tag_name": TAG_NAME,
            "name": f"MasterMD {TAG_NAME}",
            "body": RELEASE_NOTES.strip(),
            "draft": False,
            "prerelease": False,
        })

    release_id = release["id"]
    upload_url_template = release["upload_url"]
    base_upload_url = upload_url_template.split("{")[0]
    log(f"Release ID: {release_id}")

    # 上传资产文件
    current_assets = {a["name"]: a["id"] for a in release.get("assets", [])}
    assets_to_upload = [installer_path, portable_path]

    for asset_path in assets_to_upload:
        filename = asset_path.name
        file_bytes = asset_path.read_bytes()
        file_size_mb = len(file_bytes) / (1024 * 1024)

        if filename in current_assets:
            old_asset_id = current_assets[filename]
            log(f"正在删除已有资产: {filename} (ID: {old_asset_id})...")
            delete_url = f"https://api.github.com/repos/{REPO}/releases/assets/{old_asset_id}"
            api_request(delete_url, token, method="DELETE")

        log(f"正在上传资产: {filename} ({file_size_mb:.2f} MB)...")
        upload_url = f"{base_upload_url}?name={urllib.parse.quote(filename)}"
        uploaded = api_request(upload_url, token, method="POST", data=file_bytes, content_type="application/octet-stream")
        log(f"上传成功: {filename} (Asset ID: {uploaded.get('id')})")

    html_url = release.get("html_url") or f"https://github.com/{REPO}/releases/tag/{TAG_NAME}"
    print(f"\n==================================================")
    print(f"GITHUB_RELEASE_OK: {html_url}")
    print(f"==================================================")


if __name__ == "__main__":
    main()
