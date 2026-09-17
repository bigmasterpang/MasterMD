import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

export const GITHUB_REPO = "bigmasterpang/MasterMD";
export const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;

export interface UpdateInfo {
  /** 当前版本 */
  current: string;
  /** 最新版本（无发布时为 null） */
  latest: string | null;
  hasUpdate: boolean;
  /** 发布时间 */
  publishedAt: string | null;
  /** 更新说明 */
  notes: string;
  /** 发布页面地址 */
  url: string;
  /** 是否是「暂无发布版本」的情况 */
  noRelease: boolean;
  checkedAt: number;
}

interface GithubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
}

interface GithubTag {
  name?: string;
}

/** 版本号比较：返回 1 表示 a 比 b 新 */
export function compareVersion(a: string, b: string): number {
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/^v/i, "")
      .split(/[.+-]/)
      .map((part) => Number.parseInt(part, 10))
      .map((n) => (Number.isFinite(n) ? n : 0));
  const left = normalize(a);
  const right = normalize(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * 检查 GitHub 上的新版本。
 * 优先取 latest release；若仓库还没有正式发布，则回退比较最新的 tag。
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = await getVersion().catch(() => "0.0.0");
  const release = await fetchJson<GithubRelease>(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
  );

  if (release && release.tag_name) {
    const latest = release.tag_name;
    return {
      current,
      latest,
      hasUpdate: compareVersion(latest, current) > 0,
      publishedAt: release.published_at ?? null,
      notes: release.body ?? "",
      url: release.html_url ?? RELEASES_URL,
      noRelease: false,
      checkedAt: Date.now(),
    };
  }

  // 回退：比较 tags
  const tags = await fetchJson<GithubTag[]>(
    `https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=1`,
  );
  const tag = Array.isArray(tags) && tags.length > 0 ? tags[0].name ?? null : null;
  if (tag) {
    return {
      current,
      latest: tag,
      hasUpdate: compareVersion(tag, current) > 0,
      publishedAt: null,
      notes: "",
      url: `${RELEASES_URL}`,
      noRelease: false,
      checkedAt: Date.now(),
    };
  }

  return {
    current,
    latest: null,
    hasUpdate: false,
    publishedAt: null,
    notes: "",
    url: `https://github.com/${GITHUB_REPO}`,
    noRelease: true,
    checkedAt: Date.now(),
  };
}

export async function openReleasesPage(url = RELEASES_URL): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    /* ignore */
  }
}
