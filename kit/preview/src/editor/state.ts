// 编辑器壳层 UI 状态类型（协议之外的本地形态）。

import type { ApiError, Bootstrap, CandidatesData, FileEntry, Loc, Patch } from "./api";
import type { SelectionRect } from "./bridge";

export type BootstrapState =
  | { status: "loading" }
  | { status: "ready"; data: Bootstrap }
  | { status: "error"; error: ApiError };

export type SelectionState = {
  // native：原生元素（data-ludi-comp 为小写标签名），没有替换候选，不向服务端请求。
  native?: boolean;
  loc: Loc;
  instanceKey?: string | null;
  instanceCount?: number;
  rect: SelectionRect;
  file: FileEntry | null;
  loading: boolean;
  data: CandidatesData | null;
  error: ApiError | null;
};

// progressUnavailable：本次拉取失败，保留最后一次真实事件并明确说明暂时拿不到新进度。
// unknown：连续轮询失败后停止轮询，真实状态以服务端为准；界面既不标成功也不标失败，也不再占用写入锁。
export type PatchEntry = { patch: Patch; updatedAt: number; progressUnavailable?: boolean; unknown?: boolean };

export type BridgeIssue = { at: string; code: string; message: string };
