// 固件版本表单（新建 / 编辑草稿）控制器（第 4 阶段 4.4）：字段校验与提示文案、文件选择与大小规则、
// 本地 MD5 回填、提交前置条件、草稿可编辑口径、未保存改动判定，规则只写这一份。
// 框架无关：不依赖 React / Vue / 任何组件库；文件以「文件名 + 字节数」传入，不碰 File / window。
// 口径以 antd 小豆盒现版 generated/FirmwareFormPage.tsx 为准。

import type { FirmwarePackage, FirmwareVersion } from "../data";

export type SignMethod = "kms" | "manual";
export type FirmwareFormValues = {
  version: string;
  models: string[];
  note: string;
  changelog: string;
  issueId: string;
  signMethod: SignMethod;
};
export type FirmwareFormField = "version" | "models" | "note" | "changelog" | "issueId" | "signMethod";

export type FirmwarePackageInfo = { fileName: string; sizeBytes: number; md5: string };
// 手动签名文件只记元数据（文件名、大小），不落文件内容。
export type FirmwareSignFileInfo = { fileName: string; sizeBytes: number };

/** 版本号：vX.Y.Z，可带 -rc.1 / -beta.1 之类的后缀，全长不超过 50 字。 */
export const FIRMWARE_VERSION_PATTERN = /^v\d+\.\d+\.\d+(-[a-zA-Z0-9_-]+)?$/;
export const ISSUE_ID_PATTERN = /^(ISSUE|BUG|TASK)-\d+$/;
export const VERSION_MAX_LENGTH = 50;
export const NOTE_MAX_LENGTH = 200;
export const CHANGELOG_MIN_LENGTH = 10;
export const CHANGELOG_MAX_LENGTH = 5000;
export const PACKAGE_MAX_BYTES = 512 * 1024 * 1024;
export const SIGN_FILE_MAX_BYTES = 10 * 1024 * 1024;

const SIGN_METHODS: SignMethod[] = ["kms", "manual"];

/**
 * 单字段校验，返回 null 表示通过。context.editing 为已存在版本（编辑场景），此时不查版本号重复；
 * 版本号在创建后不可修改，编辑场景也不应走到版本号校验。
 */
export function firmwareFieldError(
  field: FirmwareFormField,
  values: FirmwareFormValues,
  context: { versions: FirmwareVersion[]; editing: boolean }
): string | null {
  switch (field) {
    case "version": {
      // antd：必填 + whitespace（空串或纯空格 → 必填提示）；长度与格式按原串判断，两侧有空格即格式错误，不先 trim。
      const value = values.version;
      if (!value.trim()) return "请填写固件版本号";
      if (value.length > VERSION_MAX_LENGTH) return `固件版本号不超过 ${VERSION_MAX_LENGTH} 字`;
      if (!FIRMWARE_VERSION_PATTERN.test(value)) return "固件版本号格式不正确（如 v2.4.0 或 v2.4.0-rc.1）";
      // 格式通过后原串已无首尾空格；唯一性检查与 antd validator 一致，不变。
      if (!context.editing && context.versions.some((version) => version.id === value)) return `版本 ${value} 已存在`;
      return null;
    }
    case "models":
      if (values.models.length < 1) return "机型至少选择 1 个";
      if (values.models.length > 5) return "机型最多选择 5 个";
      return null;
    case "note":
      return values.note.length > NOTE_MAX_LENGTH ? `目标版本说明不超过 ${NOTE_MAX_LENGTH} 字` : null;
    case "changelog": {
      // 必填与最短按去掉首尾空白后的内容判断，最长按原文（与 antd 表单规则同口径）。
      if (!values.changelog.trim()) return "请填写变更日志";
      if (values.changelog.trim().length < CHANGELOG_MIN_LENGTH) return `变更日志至少 ${CHANGELOG_MIN_LENGTH} 字`;
      if (values.changelog.length > CHANGELOG_MAX_LENGTH) return `变更日志不超过 ${CHANGELOG_MAX_LENGTH} 字`;
      return null;
    }
    case "issueId": {
      // antd 选填 pattern 按原串匹配：空串通过，两侧有空格或只有空格都是格式错误。
      const value = values.issueId;
      return value && !ISSUE_ID_PATTERN.test(value) ? "关联问题单号格式应为 ISSUE-123 / BUG-123 / TASK-123" : null;
    }
    case "signMethod":
      return SIGN_METHODS.includes(values.signMethod) ? null : "请选择签名方式";
  }
}

/** 草稿可编辑口径：新建永远可编辑；已有版本仅草稿状态可编辑（提示文案由界面按 statusMeta 展示）。 */
export const versionEditable = (existing: FirmwareVersion | undefined): boolean => !existing || existing.status === "draft";

/** 固件包选择校验：扩展名 .bin / .img / .zip，大小不超过 512 MB；返回 null 表示可接收。 */
export function packageFileCheck(fileName: string, sizeBytes: number): string | null {
  if (!/\.(bin|img|zip)$/i.test(fileName)) return "固件包仅支持 .bin / .img / .zip 格式";
  if (sizeBytes > PACKAGE_MAX_BYTES) return "固件包不能超过 512 MB";
  return null;
}

/** 签名文件选择校验：扩展名 .sig / .pem，大小不超过 10 MB；返回 null 表示可接收。 */
export function signFileCheck(fileName: string, sizeBytes: number): string | null {
  if (!/\.(sig|pem)$/i.test(fileName)) return "签名文件仅支持 .sig / .pem 格式";
  if (sizeBytes > SIGN_FILE_MAX_BYTES) return "签名文件不能超过 10 MB";
  return null;
}

/** 本地确定性生成 MD5 回填值（与上传文件名和大小绑定），真实校验由服务端在接收时二次执行。 */
export function pseudoMd5(name: string, size: number): string {
  let first = 0x811c9dc5;
  let second = 0x01000193;
  const source = `${name}:${size}`;
  for (let index = 0; index < source.length; index += 1) {
    first = ((first ^ source.charCodeAt(index)) * 16777619) >>> 0;
    second = (second + source.charCodeAt(index) * 2654435761) >>> 0;
  }
  const hex = (value: number, salt: number) => ((value ^ salt) >>> 0).toString(16).padStart(8, "0");
  return `${hex(first, 0)}${hex(second, 1)}${hex(first + second, 2)}${hex(first * 3 + second, 3)}`;
}

/** 字段校验通过后的提交前置条件：提交测试前必须有固件包；手动签名必须有签名文件。返回 null 表示可以继续提交。 */
export function submitBlockReason(input: { forTesting: boolean; hasPackage: boolean; signMethod: SignMethod; hasSignFile: boolean }): string | null {
  if (input.forTesting && !input.hasPackage) return "提交测试前请上传固件包";
  if (input.signMethod === "manual" && !input.hasSignFile) return "选择手动签名时请上传签名文件（.sig / .pem）";
  return null;
}

/** 未保存改动判定（取消确认的触发条件）：当前文件与原有元数据的文件名不同即视为改动。 */
export const packageInfoChanged = (current: FirmwarePackageInfo | null, original: FirmwarePackage | null): boolean =>
  (current?.fileName ?? null) !== (original?.fileName ?? null);
export const signFileInfoChanged = (current: FirmwareSignFileInfo | null, original: { fileName: string; sizeBytes: number } | null): boolean =>
  (current?.fileName ?? null) !== (original?.fileName ?? null);
