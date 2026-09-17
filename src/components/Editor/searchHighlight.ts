import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { MatchRange } from "../../utils/searchEngine";

export interface SearchHighlightPayload {
  ranges: MatchRange[];
  current: number;
}

/** 由 React 层派发：更新搜索高亮 */
export const setSearchHighlight = StateEffect.define<SearchHighlightPayload>();

/** 单文档最多绘制的匹配数，避免超长文档卡顿 */
const MAX_DECORATIONS = 3000;

const hitMark = Decoration.mark({ class: "cm-search-hit" });
const currentMark = Decoration.mark({ class: "cm-search-hit-current" });

export const searchHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    let next = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setSearchHighlight)) continue;
      const limit = tr.newDoc.length;
      const marks = [];
      const ranges = effect.value.ranges.slice(0, MAX_DECORATIONS);
      for (let i = 0; i < ranges.length; i++) {
        const from = Math.max(0, Math.min(ranges[i].from, limit));
        const to = Math.max(0, Math.min(ranges[i].to, limit));
        if (to <= from) continue;
        marks.push((i === effect.value.current ? currentMark : hitMark).range(from, to));
      }
      next = marks.length > 0 ? Decoration.set(marks, true) : Decoration.none;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});
