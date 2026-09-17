import { useEffect, useState } from "react";
import { Modal, Button } from "../common/Modal";
import { Icon } from "../common/Icon";
import { useDialogStore } from "../../stores/dialogStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUpdateStore } from "../../stores/updateStore";
import type { AccentName, ShortcutId, ThemeMode } from "../../types";
import {
  SHORTCUT_IDS,
  SHORTCUT_LABELS,
  eventToShortcut,
  findConflict,
} from "../../utils/shortcuts";
import { MAX_FONT_SIZE, MIN_FONT_SIZE, MIN_AUTOSAVE_INTERVAL } from "../../utils/constants";
import { getVersion } from "@tauri-apps/api/app";

const THEMES: Array<{ value: ThemeMode; label: string }> = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

const ACCENTS: Array<{ value: AccentName; label: string; color: string }> = [
  { value: "blue", label: "蓝", color: "#2563eb" },
  { value: "violet", label: "紫", color: "#7c3aed" },
  { value: "emerald", label: "绿", color: "#059669" },
  { value: "amber", label: "橙", color: "#d97706" },
  { value: "rose", label: "红", color: "#e11d48" },
];

const FONT_PRESETS = [
  { label: "默认", value: "" },
  { label: "Cascadia Mono", value: '"Cascadia Mono", Consolas, monospace' },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "JetBrains Mono", value: '"JetBrains Mono", Consolas, monospace' },
  { label: "微软雅黑", value: '"Microsoft YaHei", sans-serif' },
];

export function SettingsModal() {
  const open = useDialogStore((s) => s.settingsVisible);
  const close = () => useDialogStore.getState().setSettingsVisible(false);
  const settings = useSettingsStore();
  const updateState = useUpdateStore();
  const [capturing, setCapturing] = useState<ShortcutId | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [version, setVersion] = useState("");

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion("0.1.0"));
  }, []);

  const update = (patch: Parameters<typeof settings.update>[0]) => {
    settings.update(patch);
    setConflict(null);
  };

  const captureShortcut = (id: ShortcutId, event: React.KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setCapturing(null);
      return;
    }
    const value = eventToShortcut(event.nativeEvent);
    if (!value) return;
    const other = findConflict(settings.shortcuts, id, value);
    if (other) {
      setConflict(`「${value}」已被「${SHORTCUT_LABELS[other]}」占用`);
      return;
    }
    update({ shortcuts: { ...settings.shortcuts, [id]: value } });
    setCapturing(null);
  };

  return (
    <Modal
      open={open}
      title="设置"
      onClose={close}
      width={560}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              settings.reset();
              setConflict(null);
            }}
          >
            恢复默认
          </Button>
          <Button variant="primary" autoFocus onClick={close}>
            完成
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Section title="外观">
          <Row label="主题">
            <Segmented
              items={THEMES}
              value={settings.theme}
              onChange={(value) => update({ theme: value })}
            />
          </Row>
          <Row label="配色方案">
            <div className="flex items-center gap-2">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.value}
                  type="button"
                  title={accent.label}
                  onClick={() => update({ accent: accent.value })}
                  className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                    settings.accent === accent.value
                      ? "border-fg"
                      : "border-transparent"
                  }`}
                  style={{ background: accent.color }}
                />
              ))}
            </div>
          </Row>
          <Row label={`字号（${settings.fontSize}px）`}>
            <input
              type="range"
              min={MIN_FONT_SIZE}
              max={MAX_FONT_SIZE}
              value={settings.fontSize}
              onChange={(event) => update({ fontSize: Number(event.target.value) })}
              className="w-40 accent-[var(--accent)]"
            />
          </Row>
          <Row label="编辑区字体">
            <select
              value={settings.fontFamily}
              onChange={(event) => update({ fontFamily: event.target.value })}
              className="w-52 rounded-md border border-line bg-input px-2 py-1 text-[12px] text-fg"
            >
              {FONT_PRESETS.map((preset) => (
                <option key={preset.label} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </Row>
        </Section>

        <Section title="编辑器">
          <Row label={`缩进宽度（${settings.tabSize} 空格）`}>
            <input
              type="range"
              min={1}
              max={8}
              value={settings.tabSize}
              onChange={(event) => update({ tabSize: Number(event.target.value) })}
              className="w-40 accent-[var(--accent)]"
            />
          </Row>
          <Row label="自动换行">
            <Toggle
              checked={settings.wordWrap}
              onChange={(value) => update({ wordWrap: value })}
            />
          </Row>
          <Row label="显示行号">
            <Toggle
              checked={settings.showLineNumbers}
              onChange={(value) => update({ showLineNumbers: value })}
            />
          </Row>
        </Section>

        <Section title="保存">
          <Row label="自动保存">
            <Toggle
              checked={settings.autoSave}
              onChange={(value) => update({ autoSave: value })}
            />
          </Row>
          <Row label={`自动保存间隔（${settings.autoSaveInterval} 秒）`}>
            <input
              type="range"
              min={MIN_AUTOSAVE_INTERVAL}
              max={300}
              step={5}
              value={settings.autoSaveInterval}
              disabled={!settings.autoSave}
              onChange={(event) =>
                update({ autoSaveInterval: Number(event.target.value) })
              }
              className="w-40 accent-[var(--accent)] disabled:opacity-40"
            />
          </Row>
          <Row label={`最近文件上限（${settings.recentFilesLimit}）`}>
            <input
              type="range"
              min={1}
              max={10}
              value={settings.recentFilesLimit}
              onChange={(event) =>
                update({ recentFilesLimit: Number(event.target.value) })
              }
              className="w-40 accent-[var(--accent)]"
            />
          </Row>
        </Section>

        <Section title="快捷键">
          <div className="mb-2 text-[11px] text-faint">
            点击右侧按键框后按下新的组合键（需包含 Ctrl）
          </div>
          {conflict ? (
            <div className="mb-2 flex items-center gap-1 rounded-md bg-danger-soft px-2 py-1 text-[11px] text-danger">
              <Icon name="alert-triangle" size={12} />
              {conflict}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {SHORTCUT_IDS.map((id) => (
              <div key={id} className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] text-muted">
                  {SHORTCUT_LABELS[id]}
                </span>
                <button
                  type="button"
                  tabIndex={0}
                  onClick={() => setCapturing(id)}
                  onKeyDown={(event) => {
                    if (capturing === id) captureShortcut(id, event);
                  }}
                  className={`min-w-[92px] rounded-md border px-2 py-1 font-mono text-[11px] ${
                    capturing === id
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-input text-fg hover:bg-hover"
                  }`}
                >
                  {capturing === id ? "按下按键…" : settings.shortcuts[id]}
                </button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="版本更新">
          <Row label="启动时自动检查更新">
            <Toggle
              checked={settings.autoCheckUpdate}
              onChange={(value) => update({ autoCheckUpdate: value })}
            />
          </Row>
          <Row label={`当前版本 ${version}`}>
            <button
              type="button"
              onClick={() => void useUpdateStore.getState().check()}
              className="flex items-center gap-1.5 rounded-md border border-line bg-input px-2.5 py-1 text-[12px] text-fg hover:bg-hover disabled:opacity-50"
              disabled={updateState.checking}
            >
              <Icon name={updateState.checking ? "loader" : "refresh"} size={13} />
              {updateState.checking ? "检查中…" : "检查更新"}
            </button>
          </Row>
          <div className="text-[11px] text-faint">
            版本来源：github.com/bigmasterpang/MasterMD
            {updateState.info?.hasUpdate
              ? ` · 发现新版本 ${updateState.info.latest}`
              : updateState.info
                ? " · 已是最新版本"
                : ""}
          </div>
        </Section>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12px] text-muted">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-line bg-input p-0.5">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onChange(item.value)}
          className={`rounded px-2.5 py-1 text-[12px] transition-colors ${
            value === item.value
              ? "bg-accent-soft-strong font-medium text-accent"
              : "text-muted hover:text-fg"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-line-strong"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
