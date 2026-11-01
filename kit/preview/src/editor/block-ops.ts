// 区块操作的数据模型（只用于画布预览，不写源码）。
// 外壳把操作记进草稿历史（撤销 / 重做 / 刷新还原都走草稿），子端按操作列表对真实 DOM 做可撤销的变换。
// 这里只放纯函数：操作解析、把操作列表归约成每个实例的状态。
//
// 2026-10-05 增补实例模型：「新增同类」产生的副本是**独立实例**——可单独选中、删除、
// 移动、替换、问 AI，与原区块互不影响（Owner 验收反馈：副本不得与本体绑定）。
// 实例 id 规则：区块本体 = 区块 id；该区块第 n 个副本 = `${block}#c${n}`（n 从 1 起，
// 由操作序列按区块分别数出，撤销/重做重放同一串操作得到同一批 id）。

export type BlockOpKind = "delete" | "add" | "move" | "replace";

export type BlockOp = {
  page: string;
  kind: BlockOpKind;
  block: string;
  /** move：-1 上移，1 下移。 */
  dir?: -1 | 1;
  /** replace：候选模板 id（见 block-templates.tsx）。 */
  template?: string;
  /** 只作用于该实例（2026-10-05）；缺省时：删除=本体与全部副本，移动/替换=仅本体。 */
  instance?: string;
};

export type BlockInstanceState = {
  /** 所属区块 id。 */
  block: string;
  /** 副本序号；本体为 null。 */
  cloneIndex: number | null;
  deleted: boolean;
  replacement: string | null;
};

export type BlockPlan = {
  /** 实例 id 的布局顺序（含已删除；顺序留给撤销与报告核对）。 */
  order: string[];
  instances: Record<string, BlockInstanceState>;
};

export function baseBlockId(id: string): string {
  const index = id.indexOf("#c");
  return index === -1 ? id : id.slice(0, index);
}

export function cloneIndexOf(id: string): number | null {
  const match = /#c(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

export function isCloneId(id: string): boolean {
  return cloneIndexOf(id) !== null;
}

/** 实例的显示名：本体就是区块名；副本带「（新增 n）」，n 是该区块的第几个副本。 */
export function instanceDisplayName(blockName: string, cloneIndex: number | null): string {
  return cloneIndex ? `${blockName}（新增 ${cloneIndex}）` : blockName;
}

const INSTANCE_ID_PATTERN = /^[\w#-]{1,80}$/;

export function parseBlockOps(raw: unknown): BlockOp[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const ops: BlockOp[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    if (typeof record.page !== "string" || typeof record.block !== "string") return null;
    if (record.kind !== "delete" && record.kind !== "add" && record.kind !== "move" && record.kind !== "replace") return null;
    const op: BlockOp = { page: record.page, kind: record.kind, block: record.block };
    if (record.kind === "move") {
      if (record.dir !== -1 && record.dir !== 1) return null;
      op.dir = record.dir;
    }
    if (record.kind === "replace") {
      if (typeof record.template !== "string") return null;
      op.template = record.template;
    }
    if (record.instance !== undefined) {
      if (typeof record.instance !== "string" || !INSTANCE_ID_PATTERN.test(record.instance)) return null;
      op.instance = record.instance;
    }
    ops.push(op);
  }
  return ops;
}

// 把某页的操作列表归约成最终状态。ids 是该页登记区块的默认顺序。
// 上移 / 下移跳过已删除的实例；到头不动。
export function planBlocks(ids: string[], ops: BlockOp[], page: string): BlockPlan {
  const order = [...ids];
  const instances: Record<string, BlockInstanceState> = {};
  for (const id of ids) instances[id] = { block: id, cloneIndex: null, deleted: false, replacement: null };
  const addCounts: Record<string, number> = {};
  for (const op of ops) {
    if (op.page !== page) continue;
    if (op.kind === "add") {
      addCounts[op.block] = (addCounts[op.block] ?? 0) + 1;
      const copy = addCounts[op.block];
      const iid = `${op.block}#c${copy}`;
      instances[iid] = { block: op.block, cloneIndex: copy, deleted: false, replacement: null };
      // 锚点：指定了实例就插到它后面；否则插到该区块最后一个未删除实例后面。
      let anchor: string | null =
        op.instance && instances[op.instance] && !instances[op.instance].deleted ? op.instance : null;
      if (!anchor) {
        for (let index = order.length - 1; index >= 0; index -= 1) {
          const id = order[index];
          if (baseBlockId(id) === op.block && !instances[id].deleted) {
            anchor = id;
            break;
          }
        }
      }
      const position = anchor ? order.indexOf(anchor) + 1 : order.length;
      order.splice(position, 0, iid);
      continue;
    }
    let targets: string[];
    if (op.instance && instances[op.instance] && instances[op.instance].block === op.block) {
      targets = [op.instance];
    } else if (op.kind === "delete") {
      targets = order.filter((id) => baseBlockId(id) === op.block);
    } else {
      targets = [op.block];
    }
    if (op.kind === "delete") {
      for (const id of targets) instances[id].deleted = true;
    } else if (op.kind === "replace") {
      for (const id of targets) instances[id].replacement = op.template ?? null;
    } else if (op.kind === "move" && op.dir) {
      const id = targets[0];
      if (!id || instances[id].deleted) continue;
      const index = order.indexOf(id);
      let target = index + op.dir;
      while (target >= 0 && target < order.length && instances[order[target]].deleted) target += op.dir;
      if (target < 0 || target >= order.length) continue;
      [order[index], order[target]] = [order[target], order[index]];
    }
  }
  return { order, instances };
}

// 可见实例 id（未删除、按布局顺序）。present 是子端实际存在的**区块** id；副本由操作产生，天生可见。
export function visibleInstances(plan: BlockPlan, present: string[]): string[] {
  const presentSet = new Set(present);
  return plan.order.filter((id) => !plan.instances[id].deleted && (isCloneId(id) || presentSet.has(id)));
}

// 这个实例当前能不能上移 / 下移（visibleOrder 是子端上报的可见实例 id，按页面有效顺序）。
export function moveAvailability(visibleOrder: string[], instanceId: string): { up: boolean; down: boolean } {
  const index = visibleOrder.indexOf(instanceId);
  if (index === -1) return { up: false, down: false };
  return { up: index > 0, down: index < visibleOrder.length - 1 };
}

export const BLOCK_OP_LABEL: Record<BlockOpKind, string> = {
  delete: "删除",
  add: "新增同类",
  move: "移动",
  replace: "替换"
};
