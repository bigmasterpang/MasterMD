import { useState } from "react";
import { Modal, Button } from "../common/Modal";
import { Icon } from "../common/Icon";
import { useDialogStore } from "../../stores/dialogStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { ShortcutId } from "../../types";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_IDS,
  SHORTCUT_LABELS,
  SHORTCUT_REFERENCE,
  eventToShortcut,
  findConflict,
} from "../../utils/shortcuts";

/** 独立的快捷键面板：可自定义绑定 + 全部快捷键参考 */
export function ShortcutsDialog() {
  const open = useDialogStore((s) => s.shortcutsVisible);
  const close = () => useDialogStore.getState().setShortcutsVisible(false);
  const settings = useSettingsStore();
  const [capturing, setCapturing] = useState<ShortcutId | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

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
    setConflict(null);
    settings.update({ shortcuts: { ...settings.shortcuts, [id]: value } });
    setCapturing(null);
  };

  return (
    <Modal
      open={open}
      title="快捷键"
      onClose={close}
      width={640}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              settings.update({ shortcuts: { ...DEFAULT_SHORTCUTS } });
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
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
            可自定义（点击按键框后按下新组合键，需包含 Ctrl）
          </div>
          {conflict ? (
            <div className="mb-2 flex items-center gap-1 rounded-md bg-danger-soft px-2 py-1 text-[11px] text-danger">
              <Icon name="alert-triangle" size={12} />
              {conflict}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {SHORTCUT_IDS.map((id) => (
              <div key={id} className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] text-muted">{SHORTCUT_LABELS[id]}</span>
                <button
                  type="button"
                  onClick={() => setCapturing(id)}
                  onKeyDown={(event) => {
                    if (capturing === id) captureShortcut(id, event);
                  }}
                  className={`min-w-[104px] rounded-md border px-2 py-1 font-mono text-[11px] ${
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
        </section>

        {SHORTCUT_REFERENCE.map((group) => (
          <section key={group.title}>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
              {group.title}
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {group.items.map((item) => (
                <div key={item.keys} className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[12px] text-muted" title={item.label}>
                    {item.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-fg">{item.keys}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
