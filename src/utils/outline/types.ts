export type NavKind =
  | "heading"
  | "class"
  | "function"
  | "method"
  | "key"
  | "table"
  | "selector"
  | "section";

export interface NavItem {
  id: string;
  level: number;
  text: string;
  /** 源码中的行号（1 起，便于编辑器跳转） */
  line: number;
  kind: NavKind;
}
