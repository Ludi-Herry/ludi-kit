// 告警规则页控制器（第 4 阶段 4.4 批次 F）：类型/状态筛选与计数、默认排序、最近触发的规则-告警对应、
// 新建/编辑抽屉的表单草案口径、逐项校验与提示文案、提交载荷组装的规则只写这一份。
// 框架无关：不依赖 React / Vue / 任何组件库，也不直接碰 window；规则与告警数据都由调用方传入。
// 口径以 antd 小豆盒现版 generated/AlertRulesPage.tsx 为准（第 4 阶段 antd 页面暂不接入，见 docs/PLAN-四底座第4阶段-…）。
// 服务端口径的二次校验（名称 50 字、阈值范围等）在 store 的 validateAlertRuleForm 里，与这里逐项校验是双保险。

import { alertTypeLabel } from "../data";
import type { AlertRecord, AlertRule, AlertRuleType } from "../data";
import type { AlertRuleForm } from "../store";
import type { NormalizeIntegerOptions } from "./number";

/** 编辑与启停复用 create 权限点（2026-09-29 页面卡 · 页 10 裁决：不新增权限点）。 */
export const ALERT_RULE_EDIT_PERMISSION = "production:fleet:alert_rule:create";

export type RuleStatusFilter = "all" | "enabled" | "disabled";

/** 支持的三类规则（hardware_health 是设备自检，不可配置）。 */
export const ruleTypes: AlertRuleType[] = ["offline_rate_exceeded", "offline_duration_exceeded", "upgrade_fail_rate_exceeded"];
/** 表单内类型选项按 PRD ⑥ 原文；列表与筛选的标签用与告警页一致的 alertTypeLabel。 */
export const ruleTypeFormLabel: Record<AlertRuleType, string> = {
  offline_rate_exceeded: "机型/批次离线率超阈值",
  offline_duration_exceeded: "单台离线超 N 天",
  upgrade_fail_rate_exceeded: "升级失败率超阈值"
};
export const ruleTypeFilterOptions = ruleTypes.map((value) => ({ value, label: alertTypeLabel[value] }));
export const ruleTypeFormOptions = ruleTypes.map((value) => ({ value, label: ruleTypeFormLabel[value] }));
export const ruleScopeOptions = [
  { value: "model", label: "机型" },
  { value: "batch", label: "批次" }
] as const;
export const pushTaskScopeOptions = [
  { value: "all", label: "全部任务" },
  { value: "specified", label: "指定任务" }
] as const;

/** 规则数少（个位到两位数），实时过滤，不放「查询 / 重置」（interaction-decisions §2）。 */
export function deriveAlertRules(input: { rules: AlertRule[]; typeFilter: AlertRuleType | undefined; statusFilter: RuleStatusFilter }) {
  const typeFiltered = input.typeFilter ? input.rules.filter((rule) => rule.type === input.typeFilter) : input.rules;
  // Segmented 计数按当前类型筛选重算。
  const counts = {
    all: typeFiltered.length,
    enabled: typeFiltered.filter((rule) => rule.enabled).length,
    disabled: typeFiltered.filter((rule) => !rule.enabled).length
  };
  const rows = typeFiltered
    .filter((rule) => input.statusFilter === "all" || (input.statusFilter === "enabled" ? rule.enabled : !rule.enabled))
    .slice()
    .sort(compareAlertRules);
  return { typeFiltered, counts, rows };
}

/** 默认排序：启用中在前；同状态按最近触发时间降序；从未触发按创建时间排最后。 */
export function compareAlertRules(a: AlertRule, b: AlertRule): number {
  if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
  if (a.lastTriggeredAt && b.lastTriggeredAt) return b.lastTriggeredAt.localeCompare(a.lastTriggeredAt);
  if (a.lastTriggeredAt) return -1;
  if (b.lastTriggeredAt) return 1;
  return b.createdAt.localeCompare(a.createdAt);
}

/** 「最近触发时间」列：每条规则关联告警里首次发现最晚的一条。 */
export function latestAlertByRule(alerts: AlertRecord[]): Map<string, AlertRecord> {
  const map = new Map<string, AlertRecord>();
  for (const alert of alerts) {
    if (!alert.ruleId) continue;
    const current = map.get(alert.ruleId);
    if (!current || current.firstSeenAt < alert.firstSeenAt) map.set(alert.ruleId, alert);
  }
  return map;
}

// —— 新建 / 编辑抽屉的表单草案 ——

/** 抽屉草案：数值与枚举先以字符串形态保存（输入框不受数字类型约束），提交校验时才转实体。 */
export type RuleDraft = {
  type: AlertRuleType | "";
  scope: "model" | "batch" | "";
  target: string;
  thresholdPct: string;
  offlineDays: string;
  pushTaskScope: "all" | "specified" | "";
  pushTaskIds: string[];
  notifyUsers: string[];
  name: string;
};
export type RuleDraftErrors = Partial<Record<keyof RuleDraft, string>>;

export function emptyRuleDraft(): RuleDraft {
  return { type: "", scope: "", target: "", thresholdPct: "", offlineDays: "", pushTaskScope: "", pushTaskIds: [], notifyUsers: [], name: "" };
}

/** 编辑回填：null 字段回空串，阈值/天数转字符串。 */
export function ruleDraftFromRule(rule: AlertRule): RuleDraft {
  return {
    type: rule.type,
    scope: rule.scope ?? "",
    target: rule.target ?? "",
    thresholdPct: rule.thresholdPct === null ? "" : String(rule.thresholdPct),
    offlineDays: rule.offlineDays === null ? "" : String(rule.offlineDays),
    pushTaskScope: rule.pushTaskScope ?? "",
    pushTaskIds: [...rule.pushTaskIds],
    notifyUsers: [...rule.notifyUsers],
    name: rule.name
  };
}

/** 切换类型：保留规则名称与通知对象，清空并卸载不相关字段，避免残留值被一起提交。 */
export function ruleDraftAfterTypeChange(draft: RuleDraft, type: RuleDraft["type"]): RuleDraft {
  return { ...draft, type, scope: "", target: "", thresholdPct: "", offlineDays: "", pushTaskScope: "", pushTaskIds: [] };
}

/**
 * 阈值（%）与离线天数（天）输入框的归整参数：antd InputNumber 只有 precision=0，没有 min / max，
 * 失焦 / 回车时用 normalizeInteger(raw, ALERT_RULE_INTEGER_INPUT) 只做四舍五入取整（1.5 → 2），不夹边界；范围仍由下面的校验拦。
 */
export const ALERT_RULE_INTEGER_INPUT: NormalizeIntegerOptions = {};

/**
 * 范围交给提交校验而不是输入时夹取（antd InputNumber 的 min/max 会在失焦时把越界值直接夹回边界，
 * 「填 0 被拦并提示范围 1–100」就走不到了）；校验拦截 + store 二次校验是双保险。
 * 返回 null 表示通过。
 */
export function integerInputError(raw: string, label: string, min: number, max: number): string | null {
  if (raw.trim() === "") return `请填写${label}`;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return `${label}需为 ${min}–${max} 的整数`;
  return null;
}

/** 逐项校验全部字段（提交前统一跑一次，把错误一次亮出来）；返回空对象表示可以提交。 */
export function ruleDraftErrors(draft: RuleDraft): RuleDraftErrors {
  const errors: RuleDraftErrors = {};
  if (!draft.type) errors.type = "请选择规则类型";
  if (draft.type === "offline_rate_exceeded") {
    if (!draft.scope) errors.scope = "请选择适用范围";
    if (!draft.target) errors.target = "请选择目标对象";
    const thresholdError = integerInputError(draft.thresholdPct, "阈值", 1, 100);
    if (thresholdError) errors.thresholdPct = thresholdError;
  }
  if (draft.type === "offline_duration_exceeded") {
    const daysError = integerInputError(draft.offlineDays, "离线天数", 1, 90);
    if (daysError) errors.offlineDays = daysError;
  }
  if (draft.type === "upgrade_fail_rate_exceeded") {
    const thresholdError = integerInputError(draft.thresholdPct, "阈值", 1, 100);
    if (thresholdError) errors.thresholdPct = thresholdError;
    if (!draft.pushTaskScope) errors.pushTaskScope = "请选择推送任务范围";
    if (draft.pushTaskScope === "specified" && draft.pushTaskIds.length === 0) {
      errors.pushTaskIds = "指定任务时至少选择 1 个推送任务";
    }
  }
  if (draft.notifyUsers.length === 0) errors.notifyUsers = "请选择通知对象";
  const name = draft.name.trim();
  if (!name) errors.name = "请填写规则名称";
  else if (name.length > 50) errors.name = "规则名称不超过 50 字";
  return errors;
}

/** 组装提交载荷：只带当前类型相关的字段；指定任务范围之外的 pushTaskIds 不提交；名称去首尾空白。 */
export function rulePayloadFromDraft(draft: RuleDraft & { type: AlertRuleType }): AlertRuleForm {
  return {
    name: draft.name.trim(),
    type: draft.type,
    notifyUsers: draft.notifyUsers,
    ...(draft.type === "offline_rate_exceeded"
      ? { scope: (draft.scope || undefined) as "model" | "batch" | undefined, target: draft.target || undefined, thresholdPct: Number(draft.thresholdPct) }
      : {}),
    ...(draft.type === "offline_duration_exceeded" ? { offlineDays: Number(draft.offlineDays) } : {}),
    ...(draft.type === "upgrade_fail_rate_exceeded"
      ? {
          thresholdPct: Number(draft.thresholdPct),
          pushTaskScope: (draft.pushTaskScope || undefined) as "all" | "specified" | undefined,
          pushTaskIds: draft.pushTaskScope === "specified" ? draft.pushTaskIds : []
        }
      : {})
  };
}

/** 列表分页：固定每页 20 条，只有一页时不显示分页（antd 口径 pageSize 20 + hideOnSinglePage）。 */
export const RULE_PAGE_SIZE = 20;
