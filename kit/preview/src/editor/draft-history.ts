// 草稿（预览）改动的历史栈：只记未写入的草稿改动（L0 主题 26 个协议字段 + 组件 token），不碰源码。
// 同一个字段在 COALESCE_MS 内的连续输入 / 拖动合并为一步；写入成功后（bootstrap 刷新）清空。

import { useCallback, useReducer } from "react";
import type { ComponentTokensDraft, ThemeDraft, StructuresDraft, InstanceDraft } from "./api";
import type { BlockOp } from "./block-ops";

export const COALESCE_MS = 800;
const LIMIT = 100;

// L1 起草稿为复合对象：主题草案 + 组件 token 草案（null = 恢复跟随全局）。
export type EditorDraft = {
  theme: ThemeDraft;
  components: ComponentTokensDraft;
  structures?: StructuresDraft;
  instances?: InstanceDraft[];
  // 区块操作（删除 / 新增同类 / 移动 / 替换），按顺序预览；用户点「写入项目」后交给服务端 AI 改写。
  blocks?: BlockOp[];
};

type State = {
  draft: EditorDraft | null;
  past: EditorDraft[];
  future: EditorDraft[];
  lastKey: string | null;
  lastAt: number;
};

type Action =
  | { type: "init"; draft: EditorDraft }
  | { type: "change"; draft: EditorDraft; key: string; now: number }
  | { type: "undo" }
  | { type: "redo" };

const EMPTY: State = { draft: null, past: [], future: [], lastKey: null, lastAt: 0 };

// 全量比较：只比对部分字段会让「只改新字段」的草稿被历史栈静默丢弃。
function same(a: EditorDraft, b: EditorDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function draftHistoryReducer(state: State, action: Action): State {
  switch (action.type) {
    case "init":
      return { ...EMPTY, draft: action.draft };
    case "change": {
      if (!state.draft || same(state.draft, action.draft)) return state;
      const merge = state.lastKey === action.key && action.now - state.lastAt < COALESCE_MS && state.past.length > 0;
      if (merge) return { ...state, draft: action.draft, future: [], lastAt: action.now };
      return {
        draft: action.draft,
        past: [...state.past, state.draft].slice(-LIMIT),
        future: [],
        lastKey: action.key,
        lastAt: action.now
      };
    }
    case "undo": {
      if (!state.draft || state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        draft: previous,
        past: state.past.slice(0, -1),
        future: [state.draft, ...state.future],
        lastKey: null,
        lastAt: 0
      };
    }
    case "redo": {
      if (!state.draft || state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { draft: next, past: [...state.past, state.draft].slice(-LIMIT), future: rest, lastKey: null, lastAt: 0 };
    }
    default:
      return state;
  }
}

export function useDraftHistory() {
  const [state, dispatch] = useReducer(draftHistoryReducer, EMPTY);
  const init = useCallback((draft: EditorDraft) => dispatch({ type: "init", draft }), []);
  const change = useCallback(
    (draft: EditorDraft, key: string) => dispatch({ type: "change", draft, key, now: Date.now() }),
    []
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return {
    draft: state.draft,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    init,
    change,
    undo,
    redo
  };
}
