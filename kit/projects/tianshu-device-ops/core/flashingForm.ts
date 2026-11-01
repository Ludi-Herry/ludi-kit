// 新建烧录任务表单页控制器（第 4 阶段 4.4 批次 D）：字段校验规则与提示文案、设备范围解析、固件版本联动、提交载荷组装的规则只写这一份。
// 框架无关：不依赖 React / Vue / 任何组件库，也不直接碰 window；现有任务名单、设备目录都由调用方传入。
// 口径以 antd 小豆盒现版 generated/FlashingFormPage.tsx 为准（第 4 阶段 antd 页面暂不接入）。
// 关键约定：只有「收货入场」设备可进烧录任务（PRD 全局操作备注）；sn_range / sn_list 逐条点名不满足的 SN；
// 任务名称允许中间空格（只去首尾空格），与种子「B2410 首批烧录」同款写法可触发查重；重试上限表单按字符串录入、提交时转数字。

import { batches, type Device, type FlashingTaskScope } from "../data";
import type { NormalizeIntegerOptions } from "./number";

export type FlashingFormValues = {
  taskName: string;
  model: string;
  firmwareVersion: string;
  stations: string[];
  issueCert: boolean;
  certTemplate: string;
  scopeType: FlashingTaskScope;
  batches: string[];
  snStart: string;
  snEnd: string;
  snList: string;
  /** 表单按字符串录入（antd 侧是 InputNumber 数字）；校验与提交各自换算。 */
  retryLimit: string;
  remark: string;
};

export type FlashingFieldKey = keyof FlashingFormValues;

/** 第一步「下一步」要过的字段（antd stepZeroFields；issueCert / remark 无校验规则不在其中）。 */
export const FLASHING_STEP_ONE_FIELDS: FlashingFieldKey[] = ["taskName", "model", "firmwareVersion", "stations", "certTemplate"];
/** 提交时全量校验顺序；首个错误对应滚动定位（antd scrollToFirstError）。 */
export const FLASHING_FIELD_ORDER: FlashingFieldKey[] = [
  "taskName",
  "model",
  "firmwareVersion",
  "stations",
  "certTemplate",
  "scopeType",
  "batches",
  "snStart",
  "snEnd",
  "snList",
  "retryLimit",
  "remark"
];

export const scopeTypeOptions: Array<{ value: FlashingTaskScope; label: string }> = [
  { value: "batch", label: "按批次" },
  { value: "sn_range", label: "按 SN 范围" },
  { value: "sn_list", label: "手动输入 SN 列表" }
];

export const SN_PATTERN = /^[A-Z0-9]+$/;
const TASK_NAME_PATTERN = /^[一-龥A-Za-z0-9_\-. ]+$/;

/** 重试上限输入框的归整参数：antd InputNumber min=1 max=10 precision=0。失焦 / 回车时用 normalizeInteger(raw, FLASHING_RETRY_LIMIT_INTEGER) 归整后再写回（0 → 1，11 → 10，1.5 → 2）。 */
export const FLASHING_RETRY_LIMIT_INTEGER: NormalizeIntegerOptions = { min: 1, max: 10 };

/** 默认表单值：签发证书开、按批次、重试上限 3。 */
export const initialFlashingFormValues: FlashingFormValues = {
  taskName: "",
  model: "",
  firmwareVersion: "",
  stations: [],
  issueCert: true,
  certTemplate: "",
  scopeType: "batch",
  batches: [],
  snStart: "",
  snEnd: "",
  snList: "",
  retryLimit: "3",
  remark: ""
};

/** 单字段校验；返回 null 表示通过。文案与 antd Form.Item rules 逐条一致。flashingTasks 只需任务名（查重）。 */
export function validateFlashingField(
  key: FlashingFieldKey,
  values: FlashingFormValues,
  flashingTaskNames: ReadonlyArray<string>
): string | null {
  switch (key) {
    case "taskName": {
      const value = values.taskName.trim();
      if (!value) return "请填写任务名称";
      if (value.length > 64) return "任务名称不超过 64 字";
      // 允许中间空格（只去首尾空格），种子「B2410 首批烧录」可触发查重。
      if (!TASK_NAME_PATTERN.test(value)) return "任务名称仅支持中文、字母、数字、空格与 _-. 字符";
      if (flashingTaskNames.includes(value)) return "任务名称已存在";
      return null;
    }
    case "model":
      return values.model ? null : "请选择机型";
    case "firmwareVersion":
      return values.firmwareVersion ? null : "请选择固件版本";
    case "stations":
      if (values.stations.length < 1) return "烧录工位至少选择 1 个";
      if (values.stations.length > 20) return "最多同时选择 20 个工位";
      return null;
    case "certTemplate":
      return values.issueCert && !values.certTemplate ? "开启证书签发时证书模板必选" : null;
    case "scopeType":
      return values.scopeType ? null : "请选择选择方式";
    case "batches":
      return values.scopeType === "batch" && values.batches.length === 0 ? "请选择批次号" : null;
    case "snStart": {
      if (values.scopeType !== "sn_range") return null;
      // antd：必填只拦空串，格式按原串匹配，两侧有空格或只有空格都是格式错误。
      const value = values.snStart;
      if (!value) return "请填写起始 SN";
      if (!SN_PATTERN.test(value)) return "起始 SN 仅支持大写字母与数字";
      return null;
    }
    case "snEnd": {
      if (values.scopeType !== "sn_range") return null;
      const value = values.snEnd;
      if (!value) return "请填写截止 SN";
      if (!SN_PATTERN.test(value)) return "截止 SN 仅支持大写字母与数字";
      // 先后比较与 antd validator 一致，两边各自 trim 后比字典序（格式通过后截止 SN 已无空格）。
      if (values.snStart.trim() && value.trim() < values.snStart.trim()) return "截止 SN 需不小于起始 SN（字典序）";
      return null;
    }
    case "snList":
      if (values.scopeType !== "sn_list") return null;
      return values.snList.trim() ? null : "请粘贴 SN 列表";
    case "retryLimit": {
      const raw = values.retryLimit.trim();
      if (!raw) return "请设置重试上限";
      const value = Number(raw);
      return Number.isInteger(value) && value >= 1 && value <= 10 ? null : "重试上限最大 10 次，超限设备将自动进入报废流程";
    }
    case "remark":
      return values.remark.length > 200 ? "备注不超过 200 字" : null;
    default:
      return null;
  }
}

/** 按字段顺序跑一组校验，返回 {错误表, 首个出错字段}；用于「下一步」与「提交」。 */
export function validateFlashingFields(
  keys: FlashingFieldKey[],
  values: FlashingFormValues,
  flashingTaskNames: ReadonlyArray<string>
): { errors: Partial<Record<FlashingFieldKey, string>>; firstError: FlashingFieldKey | null } {
  const errors: Partial<Record<FlashingFieldKey, string>> = {};
  let firstError: FlashingFieldKey | null = null;
  for (const key of keys) {
    const message = validateFlashingField(key, values, flashingTaskNames);
    if (message) {
      errors[key] = message;
      firstError ??= key;
    }
  }
  return { errors, firstError };
}

/** 仅收货入场状态的设备可被选入烧录任务（PRD 全局操作备注）。 */
export const receivedOnlyDevices = (devices: Device[]) => devices.filter((device) => device.lifecycle === "received");

/** 批次号选项：只列还有收货入场设备的批次（antd receivedBatches，data 的 batches 目录过滤）。 */
export function flashingReceivedBatches(receivedDevices: Device[]): string[] {
  return batches.filter((batch) => receivedDevices.some((device) => device.batch === batch));
}

/** 已发布的固件版本（已全量 / 灰度中 / 测试中），草稿与已停用不可选。 */
export function publishedFlashingVersions<T extends { status: string }>(versions: ReadonlyArray<T>): T[] {
  return versions.filter((version) => version.status === "released" || version.status === "canary" || version.status === "testing");
}

/** 固件版本联动：选中机型后只显示适用该机型的版本；未选机型显示全部已发布版本。 */
export function flashingVersionOptions<T extends { version: string; models: string[]; status: string }>(
  versions: ReadonlyArray<T>,
  model: string
): T[] {
  return publishedFlashingVersions(versions).filter((version) => !model || version.models.includes(model));
}

export type FlashingScopeInput = {
  scopeType: FlashingTaskScope;
  batches: string[];
  snStart: string;
  snEnd: string;
  snList: string;
};

// —— 设备范围实时解析（antd scopeResult）：当前选择方式下命中的可烧录设备（存在且收货入场）——

/** 按批次：批次内全部收货入场设备；未选批次时为空（表单必填兜底）。 */
export function flashingScopeByBatch(receivedDevices: Device[], selectedBatches: string[]): { devices: Device[]; errors: string[] } {
  if (selectedBatches.length === 0) return { devices: [], errors: [] };
  return { devices: receivedDevices.filter((device) => selectedBatches.includes(device.batch)), errors: [] };
}

/** 按 SN 范围：字典序闭区间；范围内所有 SN 均须存在且为收货入场，不满足的明确点名（后端口径）。 */
export function flashingScopeBySnRange(devices: Device[], snStart: string, snEnd: string): { devices: Device[]; errors: string[] } {
  const start = snStart.trim();
  const end = snEnd.trim();
  if (!start || !end || !SN_PATTERN.test(start) || !SN_PATTERN.test(end) || end < start) return { devices: [], errors: [] };
  const inScope = devices.filter((device) => device.sn >= start && device.sn <= end);
  if (inScope.length === 0) return { devices: [], errors: [] };
  const unusable = inScope.filter((device) => device.lifecycle !== "received");
  if (unusable.length > 0) return { devices: [], errors: [`SN ${unusable[0].sn} 当前不是收货入场状态，不能加入烧录任务`] };
  return { devices: inScope, errors: [] };
}

/** 手动输入 SN 列表：逐行校验非法字符 / 重复 / 不存在 / 非收货入场；最多 500 台。 */
export function flashingScopeBySnList(devices: Device[], snListRaw: string): { devices: Device[]; errors: string[] } {
  const lines = snListRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const errors: string[] = [];
  const picked: Device[] = [];
  const seen = new Set<string>();
  snListRaw.split("\n").forEach((line, index) => {
    const sn = line.trim();
    if (!sn) return;
    if (!SN_PATTERN.test(sn)) {
      errors.push(`第 ${index + 1} 行「${sn}」含非法字符（仅支持大写字母与数字）`);
      return;
    }
    if (seen.has(sn)) {
      errors.push(`第 ${index + 1} 行「${sn}」与前面重复`);
      return;
    }
    seen.add(sn);
    const device = devices.find((item) => item.sn === sn);
    if (!device) {
      errors.push(`第 ${index + 1} 行 SN「${sn}」不存在`);
      return;
    }
    if (device.lifecycle !== "received") {
      errors.push(`第 ${index + 1} 行 SN「${sn}」当前不是收货入场状态，不能加入烧录任务`);
      return;
    }
    picked.push(device);
  });
  if (lines.length > 500) errors.push("单次任务最多 500 台，请拆分批次");
  return { devices: picked, errors };
}

/** 三种方式的统一入口（antd scopeResult useMemo 的完整口径）。 */
export function flashingScopeResult(devices: Device[], input: FlashingScopeInput): { devices: Device[]; errors: string[] } {
  if (input.scopeType === "batch") return flashingScopeByBatch(receivedOnlyDevices(devices), input.batches);
  if (input.scopeType === "sn_range") return flashingScopeBySnRange(devices, input.snStart, input.snEnd);
  return flashingScopeBySnList(devices, input.snList);
}

/** 提交时范围为空 / 有错时，错误落到哪个字段（antd 用全局 message；shadcn 落到字段，同一文案）。 */
export function flashingScopeErrorField(values: FlashingFormValues, scopeResult: { devices: Device[]; errors: string[] }): { key: FlashingFieldKey; message: string } | null {
  if (scopeResult.errors.length > 0) return { key: values.scopeType === "sn_list" ? "snList" : "snEnd", message: scopeResult.errors[0] };
  if (scopeResult.devices.length === 0) {
    const key: FlashingFieldKey = values.scopeType === "batch" ? "batches" : values.scopeType === "sn_range" ? "snEnd" : "snList";
    return { key, message: "当前设备范围没有可烧录的设备（需为收货入场状态）" };
  }
  return null;
}

/** 提交载荷：与 store.createFlashingTask 的入参对齐（retryLimit 转数字、未签证书时模板置空）。 */
export function buildFlashingTaskForm(values: FlashingFormValues, scopeSns: string[]) {
  const scopeValue =
    values.scopeType === "batch"
      ? values.batches.join("、")
      : values.scopeType === "sn_range"
        ? `${values.snStart.trim()} ~ ${values.snEnd.trim()}`
        : `${scopeSns.length} 台`;
  return {
    taskName: values.taskName,
    model: values.model,
    firmwareVersion: values.firmwareVersion,
    stations: values.stations,
    issueCert: values.issueCert,
    certTemplate: values.issueCert ? values.certTemplate : null,
    scopeType: values.scopeType,
    scopeValue,
    scopeSns,
    retryLimit: Number(values.retryLimit),
    remark: values.remark
  };
}
