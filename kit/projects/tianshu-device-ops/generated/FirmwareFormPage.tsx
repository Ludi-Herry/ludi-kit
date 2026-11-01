import { useState } from "react";
import { Alert, App, Button, Form, Input, Popconfirm, Radio, Select, Skeleton, Space, Typography, Upload } from "antd";
import { ArrowLeftOutlined, UploadOutlined } from "@ant-design/icons";
import { firmwareStatusMeta, models } from "../data";
import { deviceOpsStore, useDeviceOpsState } from "../store";
import { appPath, safeReturnTo, useDataState, usePermission, useQueryParams, useRouter } from "../ui";
import "./firmware.css";
import {
  CHANGELOG_MAX_LENGTH,
  CHANGELOG_MIN_LENGTH,
  FIRMWARE_VERSION_PATTERN,
  ISSUE_ID_PATTERN,
  NOTE_MAX_LENGTH,
  VERSION_MAX_LENGTH,
  packageFileCheck,
  packageInfoChanged,
  pseudoMd5,
  signFileCheck,
  signFileInfoChanged,
  submitBlockReason,
  versionEditable,
  type FirmwarePackageInfo,
  type FirmwareSignFileInfo
} from "../core/firmwareForm";

type FormValues = {
  version: string;
  models: string[];
  note?: string;
  changelog: string;
  issueId?: string;
  signMethod: "kms" | "manual";
};


const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// 无权限置灰与悬停说明统一走 ui.tsx 的 guard()（2026-09-29 集成：替换原生 title 变通写法）。
export function FirmwareFormPage({ id }: { id: string | null }) {
  const { message } = App.useApp();
  const { navigate, search } = useRouter();
  const params = useQueryParams();
  const dataState = useDataState();
  const { readonly, guard } = usePermission();
  const { firmwareVersions } = useDeviceOpsState();
  const existing = id ? firmwareVersions.find((version) => version.id === id) : undefined;
  const editable = versionEditable(existing);

  const [form] = Form.useForm<FormValues>();
  const signMethod = Form.useWatch("signMethod", form) ?? "kms";
  const [packageInfo, setPackageInfo] = useState<FirmwarePackageInfo | null>(existing?.package ? { ...existing.package } : null);
  const [signFile, setSignFile] = useState<FirmwareSignFileInfo | null>(existing?.signFile ? { ...existing.signFile } : null);

  const backTo = safeReturnTo(params.get("from")) ?? `${appPath("/system/firmware")}?tab=version`;
  const backLink = (
    <a className="device-ops-back" href={backTo}>
      <ArrowLeftOutlined aria-hidden="true" aria-label={undefined} />
      固件与推送
    </a>
  );

  const retry = () => {
    const next = new URLSearchParams(search);
    next.delete("dataState");
    navigate(`${id ? appPath(`/system/firmware/${encodeURIComponent(id)}/edit`) : appPath("/system/firmware/new")}${next.size ? `?${next}` : ""}`);
  };

  if (dataState === "loading") {
    return (
      <div className="device-ops-stack">
        <header className="device-ops-detail-head__main">{backLink}</header>
        <section aria-label="正在加载表单" className="device-ops-panel">
          <Skeleton active paragraph={{ rows: 6 }} title={{ width: 240 }} />
        </section>
      </div>
    );
  }

  if (dataState === "error") {
    return (
      <div className="device-ops-stack">
        <header className="device-ops-detail-head__main">{backLink}</header>
        <Alert
          action={
            <Button onClick={retry} size="small">
              重试
            </Button>
          }
          description="网络异常或服务暂时不可用，请稍后重试。"
          showIcon
          title="固件版本表单加载失败"
          type="error"
        />
      </div>
    );
  }

  if (id && !existing) {
    return (
      <div className="device-ops-stack">
        <header className="device-ops-detail-head__main">{backLink}</header>
        <Alert
          action={
            <Button href={backTo} size="small">
              返回固件与推送
            </Button>
          }
          description={`没有编号为 ${id} 的固件版本，可能已被删除。`}
          showIcon
          title="未找到该固件版本"
          type="warning"
        />
      </div>
    );
  }

  const pickPackage = (file: File) => {
    const error = packageFileCheck(file.name, file.size);
    if (error) {
      message.error(error);
      return Upload.LIST_IGNORE;
    }
    setPackageInfo({ fileName: file.name, sizeBytes: file.size, md5: pseudoMd5(file.name, file.size) });
    return false;
  };

  const pickSignFile = (file: File) => {
    const error = signFileCheck(file.name, file.size);
    if (error) {
      message.error(error);
      return Upload.LIST_IGNORE;
    }
    setSignFile({ fileName: file.name, sizeBytes: file.size });
    return false;
  };

  const packageDirty = packageInfoChanged(packageInfo, existing?.package ?? null);
  const signFileDirty = signFileInfoChanged(signFile, existing?.signFile ?? null);

  const submit = async (forTesting: boolean) => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    const blockReason = submitBlockReason({ forTesting, hasPackage: Boolean(packageInfo), signMethod: values.signMethod, hasSignFile: Boolean(signFile) });
    if (blockReason) {
      message.warning(blockReason);
      return;
    }
    const result = deviceOpsStore.saveFirmwareVersion(
      id,
      {
        version: values.version.trim(),
        models: values.models,
        note: values.note,
        changelog: values.changelog,
        issueId: values.issueId?.trim() || undefined,
        ...(packageInfo ? { package: packageInfo } : {}),
        signMethod: values.signMethod,
        signFile: values.signMethod === "manual" ? signFile : null
      },
      forTesting
    );
    if (!result.ok) {
      message.error(`保存失败：${result.reason}`);
      return;
    }
    message.success(result.message ?? "已保存");
    navigate(backTo);
  };

  // 取消为 B 档气泡确认：有未保存改动时给出「放弃 / 继续填写」；无改动直接返回。
  const formDirty = () => form.isFieldsTouched() || packageDirty || signFileDirty;

  const initialValues: Partial<FormValues> = existing
    ? {
        version: existing.version,
        models: existing.models,
        note: existing.note ?? undefined,
        changelog: existing.changelog,
        issueId: existing.issueId ?? undefined,
        signMethod: existing.signMethod
      }
    : { signMethod: "kms" };

  return (
    <div className="device-ops-stack">
      <header className="device-ops-detail-head">
        <div className="device-ops-detail-head__main">
          {backLink}
          <Typography.Title className="device-ops-title" level={1}>
            {existing ? `编辑固件版本 · ${existing.version}` : "新建固件版本"}
          </Typography.Title>
          <p className="device-ops-detail-head__sub">
            {existing ? "仅草稿状态的版本可编辑；提交测试后进入测试中并由 KMS 自动签名。" : "保存草稿可随时继续完善，提交测试后版本进入测试中。"}
          </p>
        </div>
      </header>

      {!editable && (
        <Alert
          description={existing ? `当前状态为「${firmwareStatusMeta[existing.status].label}」，表单以只读方式展示。` : ""}
          showIcon
          title="仅草稿状态的版本可编辑"
          type="warning"
        />
      )}
      {readonly && <Alert showIcon title="当前账号为只读视角，表单仅供查看，不能提交" type="info" />}

      <Form
        disabled={readonly || !editable}
        form={form}
        initialValues={initialValues}
        key={existing?.id ?? "new"}
        layout="vertical"
        scrollToFirstError
      >
        <section aria-label="基本信息" className="device-ops-panel">
          <h2 className="device-ops-group__title">基本信息</h2>
          <div className="device-ops-form-row">
            <Form.Item
              extra={existing ? "版本号创建后不可修改。" : "格式如 v2.4.0 / v2.4.0-rc.1，不能与已有版本号重复。"}
              label="固件版本号"
              name="version"
              rules={[
                { required: true, whitespace: true, message: "请填写固件版本号" },
                { max: VERSION_MAX_LENGTH, message: `固件版本号不超过 ${VERSION_MAX_LENGTH} 字` },
                { pattern: FIRMWARE_VERSION_PATTERN, message: "固件版本号格式不正确（如 v2.4.0 或 v2.4.0-rc.1）" },
                {
                  validator: (_, value: string) =>
                    !existing && value && firmwareVersions.some((version) => version.id === value.trim())
                      ? Promise.reject(new Error(`版本 ${value} 已存在`))
                      : Promise.resolve()
                }
              ]}
            >
              <Input maxLength={VERSION_MAX_LENGTH} placeholder="v2.4.2" readOnly={Boolean(existing)} />
            </Form.Item>
            <Form.Item
              label="机型（1–5 个）"
              name="models"
              required
              rules={[
                {
                  validator: (_, value: string[]) =>
                    !value || value.length < 1 ? Promise.reject(new Error("机型至少选择 1 个")) : value.length > 5 ? Promise.reject(new Error("机型最多选择 5 个")) : Promise.resolve()
                }
              ]}
            >
              <Select maxTagCount="responsive" mode="multiple" options={models.map((value) => ({ value, label: value }))} placeholder="选择适用机型" />
            </Form.Item>
          </div>
          <Form.Item label="目标版本说明" name="note" rules={[{ max: NOTE_MAX_LENGTH, message: `目标版本说明不超过 ${NOTE_MAX_LENGTH} 字` }]}>
            <Input.TextArea maxLength={NOTE_MAX_LENGTH} placeholder="用一句话说明这个版本面向的目标（选填）" rows={2} showCount />
          </Form.Item>
        </section>

        <section aria-label="固件包与签名" className="device-ops-panel">
          <h2 className="device-ops-group__title">固件包与签名</h2>
          <Form.Item label="固件包（.bin / .img / .zip，不超过 512 MB）" required={!existing?.package}>
            {packageInfo ? (
              <div className="firmware-snfile">
                <span className="firmware-snfile__name">{packageInfo.fileName}</span>
                <span className="device-ops-muted">{formatSize(packageInfo.sizeBytes)}</span>
                {!readonly && editable && (
                  <Button
                    onClick={() => setPackageInfo(null)}
                    size="small"
                    type="link"
                  >
                    重新上传
                  </Button>
                )}
              </div>
            ) : (
              <Upload accept=".bin,.img,.zip" beforeUpload={pickPackage} maxCount={1}>
                <Button icon={<UploadOutlined aria-hidden="true" aria-label={undefined} />}>选择固件包</Button>
              </Upload>
            )}
          </Form.Item>
          <Form.Item extra="上传固件包后自动计算并回填；服务端接收时会二次校验。" label="MD5">
            <Input placeholder="上传固件包后自动回填" readOnly value={packageInfo?.md5 ?? ""} />
          </Form.Item>
          <Form.Item label="签名方式" name="signMethod" rules={[{ required: true, message: "请选择签名方式" }]}>
            <Radio.Group>
              <Radio value="kms">KMS 自动签名</Radio>
              <Radio value="manual">手动上传签名文件</Radio>
            </Radio.Group>
          </Form.Item>
          {signMethod === "kms" && <p className="device-ops-group__helper">密钥 ID 只显示前几位</p>}
          {signMethod === "manual" && (
            <Form.Item label="签名文件（.sig / .pem，不超过 10 MB）" required>
              {signFile ? (
                <div className="firmware-snfile">
                  <span className="firmware-snfile__name">{signFile.fileName}</span>
                  <span className="device-ops-muted">{formatSize(signFile.sizeBytes)}</span>
                  {!readonly && editable && (
                    <Button onClick={() => setSignFile(null)} size="small" type="link">
                      重新上传
                    </Button>
                  )}
                </div>
              ) : (
                <Upload accept=".sig,.pem" beforeUpload={pickSignFile} maxCount={1}>
                  <Button icon={<UploadOutlined aria-hidden="true" aria-label={undefined} />}>选择签名文件</Button>
                </Upload>
              )}
            </Form.Item>
          )}
        </section>

        <section aria-label="变更记录" className="device-ops-panel">
          <h2 className="device-ops-group__title">变更记录</h2>
          <Form.Item
            label="变更日志"
            name="changelog"
            rules={[
              { required: true, whitespace: true, message: "请填写变更日志" },
              { min: CHANGELOG_MIN_LENGTH, transform: (value: string) => (value ?? "").trim(), message: `变更日志至少 ${CHANGELOG_MIN_LENGTH} 字` },
              { max: CHANGELOG_MAX_LENGTH, message: `变更日志不超过 ${CHANGELOG_MAX_LENGTH} 字` }
            ]}
          >
            <Input.TextArea maxLength={CHANGELOG_MAX_LENGTH} placeholder="记录本版本的变更点，10–5000 字" rows={5} showCount />
          </Form.Item>
          <Form.Item
            extra="单号暂未匹配到记录时仍可提交"
            label="关联问题单号"
            name="issueId"
            rules={[{ pattern: ISSUE_ID_PATTERN, message: "关联问题单号格式应为 ISSUE-123 / BUG-123 / TASK-123" }]}
          >
            <Input maxLength={32} placeholder="ISSUE-1042（选填）" />
          </Form.Item>
        </section>
      </Form>

      <footer className="device-ops-panel firmware-form-actions">
        {editable ? (
          <Space size={8} wrap>
            <Popconfirm
              cancelText="继续填写"
              description="当前填写的内容不会被保存。"
              disabled={!formDirty()}
              okText="放弃"
              onConfirm={() => navigate(backTo)}
              title="放弃未保存内容？"
            >
              <Button onClick={() => { if (!formDirty()) navigate(backTo); }}>取消</Button>
            </Popconfirm>
            {guard(
              "保存",
              <Button disabled={readonly} onClick={() => submit(false)}>
                保存草稿
              </Button>
            )}
            {guard(
              "提交测试",
              <Button disabled={readonly} onClick={() => submit(true)} type="primary">
                提交测试
              </Button>
            )}
          </Space>
        ) : (
          <Button href={backTo}>返回固件与推送</Button>
        )}
      </footer>
    </div>
  );
}
