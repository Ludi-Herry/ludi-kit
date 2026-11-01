import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Tag, Tooltip, Typography } from "antd";
import { FlagOutlined } from "@ant-design/icons";
import {
  accountStatusMeta,
  alertStatusMeta,
  certMeta,
  feedbackStatusMeta,
  feedbackTypeMeta,
  firmwareSignStatusMeta,
  firmwareStatusMeta,
  flashingResultMeta,
  lifecycleMeta,
  onlineMeta,
  passportPublishMeta,
  pushResultMeta,
  pushTaskStatusMeta,
  qcMeta,
  rmaArrivalMeta,
  rmaConclusionMeta,
  rmaDecisionMeta,
  type AccountStatus,
  type AlertLevel,
  type AlertStatus,
  type CertState,
  type FeedbackStatus,
  type FeedbackType,
  type FirmwareSignStatus,
  type FirmwareStatus,
  type FlashingResult,
  type LifecycleState,
  type OnlineState,
  type PassportPublishState,
  type PushResultStatus,
  type PushTaskStatus,
  type QcResult,
  type RmaArrivalStatus,
  type RmaConclusion,
  type RmaDecisionMethod
} from "./data";

export const APP_PREFIX = "/device-ops";
export const appPath = (route: string) => `${APP_PREFIX}${route}`;

type RouterValue = { pathname: string; search: string; navigate: (to: string, replace?: boolean) => void };
export const RouterContext = createContext<RouterValue>({ pathname: "/dashboard", search: "", navigate: () => undefined });
export const useRouter = () => useContext(RouterContext);

export function useQueryParams() {
  const { search } = useRouter();
  return useMemo(() => new URLSearchParams(search), [search]);
}

// 详情页的来源白名单（2026-09-29 批 2 扩展）：只接受这些站内根路径（含子路径与查询串）作为“返回”目标。
const RETURN_ROOTS = [
  "/alerts",
  "/devices",
  "/lifecycle/passport",
  "/lifecycle/flashing",
  "/exceptions/rma",
  "/exceptions/feedback",
  "/system/firmware",
  "/system/alert-rules",
  "/users/binding",
  "/dashboard"
];

export function safeReturnTo(raw: string | null) {
  if (!raw) return null;
  const matched = RETURN_ROOTS.some((root) => {
    const full = appPath(root);
    if (raw === full) return true;
    const follow = raw[full.length];
    return raw.startsWith(full) && (follow === "/" || follow === "?" || follow === "#");
  });
  return matched ? raw : null;
}

// 来源上下文：详情页把当前地址带给下一步，保证“返回”可回到原筛选态。
export function returnUrlFrom(pathname: string, search: string) {
  return `${appPath(pathname)}${search}`;
}

export type DataState = "ready" | "loading" | "empty" | "error";
export function useDataState(): DataState {
  const value = useQueryParams().get("dataState");
  return value === "loading" || value === "empty" || value === "error" ? value : "ready";
}

export function usePermission() {
  const readonly = useQueryParams().get("perm") === "readonly";
  return {
    readonly,
    // 无权限时按钮置灰，并说明缺哪项权限。
    // antd v6 的 disabled Button 带 pointer-events: none，Tooltip 直接包按钮时悬停不触发；
    // 统一在 guard 内用 span 承接悬停（2026-09-29 批 1 集成修正，各页不再各自包裹）。
    guard(action: string, node: ReactNode) {
      return readonly ? (
        <Tooltip title={`当前账号无${action}权限`}>
          <span className="device-ops-guard">{node}</span>
        </Tooltip>
      ) : (
        node
      );
    }
  };
}

// 无权限统一为“可见但置灰，悬停说明原因”，不做点进去才报 403 的入口。
export function LockedText({ children, reason }: { children: ReactNode; reason: string }) {
  return (
    <Tooltip title={reason}>
      <span className="device-ops-locked" tabIndex={0}>{children}</span>
    </Tooltip>
  );
}

export function LifecycleTag({ value }: { value: LifecycleState }) {
  const meta = lifecycleMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function OnlineTag({ value }: { value: OnlineState | null }) {
  if (!value) return <span className="device-ops-muted">—</span>;
  const meta = onlineMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function QcTag({ value }: { value: QcResult }) {
  const meta = qcMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function CertTag({ value }: { value: CertState }) {
  const meta = certMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function AlertStatusTag({ value }: { value: AlertStatus }) {
  const meta = alertStatusMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

// 2026-09-29 批 1 页面卡：新枚举的状态 Tag，颜色全部来自 data.ts meta，不自造。
export function PassportPublishTag({ published }: { published: boolean }) {
  const meta = passportPublishMeta[published ? "published" : "unpublished"];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function RmaArrivalTag({ value }: { value: RmaArrivalStatus }) {
  const meta = rmaArrivalMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function RmaConclusionTag({ value }: { value: RmaConclusion }) {
  const meta = rmaConclusionMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function RmaDecisionTag({ value }: { value: RmaDecisionMethod }) {
  const meta = rmaDecisionMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function FirmwareStatusTag({ value }: { value: FirmwareStatus }) {
  const meta = firmwareStatusMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function FirmwareSignStatusTag({ value }: { value: FirmwareSignStatus }) {
  const meta = firmwareSignStatusMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function PushTaskStatusTag({ value }: { value: PushTaskStatus }) {
  const meta = pushTaskStatusMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function PushResultTag({ value }: { value: PushResultStatus }) {
  const meta = pushResultMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

// 2026-09-29 批 2 页面卡：新枚举的状态 Tag，颜色全部来自 data.ts meta，不自造。
export function FlashingResultTag({ value }: { value: FlashingResult }) {
  const meta = flashingResultMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function FeedbackStatusTag({ value }: { value: FeedbackStatus }) {
  const meta = feedbackStatusMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function FeedbackTypeTag({ value }: { value: FeedbackType }) {
  const meta = feedbackTypeMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function AccountStatusTag({ value }: { value: AccountStatus }) {
  const meta = accountStatusMeta[value];
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

// 级别不占状态色：只用灰度深浅和字重区分。
export function AlertLevelText({ level }: { level: AlertLevel }) {
  return (
    <span className={`device-ops-level device-ops-level--${level.toLowerCase()}`}>
      <FlagOutlined aria-hidden="true" aria-label={undefined} />
      {level}
    </span>
  );
}

export function SnLink({ sn, from }: { sn: string; from?: string }) {
  return (
    <Typography.Text className="device-ops-sn" copyable={{ text: sn, tooltips: ["复制 SN", "已复制"] }}>
      <a href={`${appPath(`/devices/${sn}`)}${from ? `?from=${encodeURIComponent(from)}` : ""}`}>{sn}</a>
    </Typography.Text>
  );
}
