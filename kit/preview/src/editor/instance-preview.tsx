// Dev-only JSX hooks injected by editor-server/plugin.mjs; no source writes or eval.
import { Tag } from "antd";
import { SearchOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined, InfoCircleOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import type { InstanceDraft, SlotValue, StructureDraft } from "./api";

let drafts: InstanceDraft[] = [];
export const locKey = (loc: InstanceDraft["loc"]) => `${loc.file}:${loc.line}:${loc.column}`;
export function setInstancePreview(values: InstanceDraft[]) { drafts = values; }
function selected(loc: string, key: string | null) {
  return drafts.find(d => locKey(d.loc) === loc && d.instanceKey === key)?.changes;
}
function slot(value: SlotValue) {
  switch (value.kind) {
    case "none": return undefined;
    case "text": return value.text;
    case "tag": return <Tag>{value.text}</Tag>;
    case "icon": switch (value.name) {
      case "SearchOutlined": return <SearchOutlined aria-hidden />;
      case "PlusOutlined": return <PlusOutlined aria-hidden />;
      case "ReloadOutlined": return <ReloadOutlined aria-hidden />;
      case "DeleteOutlined": return <DeleteOutlined aria-hidden />;
      case "InfoCircleOutlined": return <InfoCircleOutlined aria-hidden />;
      case "CheckOutlined": return <CheckOutlined aria-hidden />;
      case "CloseOutlined": return <CloseOutlined aria-hidden />;
      default: return undefined;
    }
  }
}
export function nestedStyles(base: Record<string, unknown>, changes: StructureDraft) {
  const result = structuredClone(base);
  for (const [part, fields] of Object.entries(changes)) {
    let cursor = result;
    for (const key of part.split(".")) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("非法结构层");
      cursor = (cursor[key] ??= {}) as Record<string, unknown>;
    }
    for (const [key, value] of Object.entries(fields)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) continue;
      if (value === null) delete cursor[key]; else cursor[key] = value;
    }
  }
  return result;
}
export function previewProps(loc: string, key: string | null, fields: string[], slots: string[], styleAttribute: string | null, originalStyles: Record<string,unknown> | undefined, native: boolean) {
  const changes = selected(loc, key), props: Record<string, unknown> = {};
  if (!changes) return props;
  for (const [name, value] of Object.entries(changes.props ?? {})) if (fields.includes(name)) props[name] = value === null ? undefined : value;
  for (const [name, value] of Object.entries(changes.slots ?? {})) if (slots.includes(name)) props[name] = slot(value);
  if (styleAttribute && changes.styles) {
    const original = { ...(originalStyles ?? {}) };
    props[styleAttribute] = native ? nestedStyles({root:original},changes.styles).root : nestedStyles(original,changes.styles);
  }
  return props;
}
export function previewText(loc: string, key: string | null, original: string) {
  const value = selected(loc,key)?.text;
  return value === undefined ? original : value;
}
