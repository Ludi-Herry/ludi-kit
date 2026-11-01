import { useMemo, useState } from "react";
import { Alert, App, Button, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Skeleton, Space, Steps, Switch, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { certTemplates, flashingStations, models, type Device, type FlashingTaskScope } from "../data";
import { deviceOpsStore, useDeviceOpsState } from "../store";
import { appPath, safeReturnTo, useDataState, usePermission, useQueryParams, useRouter } from "../ui";
import "./flashing.css";
import {
  FLASHING_STEP_ONE_FIELDS,
  SN_PATTERN,
  flashingReceivedBatches,
  flashingScopeResult,
  flashingVersionOptions,
  publishedFlashingVersions,
  receivedOnlyDevices,
  scopeTypeOptions
} from "../core/flashingForm";

type FormValues = {
  taskName: string;
  model: string;
  firmwareVersion?: string;
  stations: string[];
  issueCert: boolean;
  certTemplate?: string;
  scopeType: FlashingTaskScope;
  batches?: string[];
  snStart?: string;
  snEnd?: string;
  snList?: string;
  retryLimit: number;
  remark?: string;
};

const stepZeroFields = FLASHING_STEP_ONE_FIELDS;

export function FlashingFormPage() {
  const { message } = App.useApp();
  const { navigate, search } = useRouter();
  const params = useQueryParams();
  const dataState = useDataState();
  const { readonly, guard } = usePermission();
  const { devices, firmwareVersions, flashingTasks } = useDeviceOpsState();

  const [form] = Form.useForm<FormValues>();
  const [step, setStep] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const model = Form.useWatch("model", form);
  const firmwareVersion = Form.useWatch("firmwareVersion", form);
  const issueCert = Form.useWatch("issueCert", form) ?? true;
  const scopeType = Form.useWatch("scopeType", form) ?? "batch";
  const scopeBatches = Form.useWatch("batches", form) ?? [];
  const snStart = Form.useWatch("snStart", form) ?? "";
  const snEnd = Form.useWatch("snEnd", form) ?? "";
  const snListRaw = Form.useWatch("snList", form) ?? "";

  const backTo = safeReturnTo(params.get("from")) ?? appPath("/lifecycle/flashing");
  const backLink = (
    <a className="device-ops-back" href={backTo}>
      <ArrowLeftOutlined aria-hidden="true" aria-label={undefined} />
      烧录发证
    </a>
  );

  const retry = () => {
    const next = new URLSearchParams(search);
    next.delete("dataState");
    navigate(`${appPath("/lifecycle/flashing/new")}${next.size ? `?${next}` : ""}`);
  };

  // 仅收货入场状态的设备可被选入烧录任务（PRD 全局操作备注）。
  const receivedBatches = useMemo(() => flashingReceivedBatches(receivedOnlyDevices(devices)), [devices]);

  // 已发布的固件版本（已全量 / 灰度中 / 测试中），选中机型后按适用机型联动。
  const versionOptions = useMemo(
    () =>
      flashingVersionOptions(firmwareVersions, model ?? "").map((version) => ({ value: version.version, label: version.version })),
    [firmwareVersions, model]
  );
  const selectedVersion = publishedFlashingVersions(firmwareVersions).find((version) => version.version === firmwareVersion);

  // 第二步实时预览：当前选择方式下命中的可烧录设备（存在且收货入场）。
  const scopeResult = useMemo(
    (): { devices: Device[]; errors: string[] } =>
      flashingScopeResult(devices, { scopeType, batches: scopeBatches, snStart, snEnd, snList: snListRaw }),
    [scopeType, scopeBatches, snStart, snEnd, snListRaw, devices]
  );

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
          title="新建烧录任务表单加载失败"
          type="error"
        />
      </div>
    );
  }

  const formDirty = () => form.isFieldsTouched();

  const goNext = async () => {
    const values = await form.validateFields(stepZeroFields).catch(() => null);
    if (!values) return;
    setStep(1);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const submit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    if (scopeResult.errors.length > 0) {
      message.error(scopeResult.errors[0]);
      return;
    }
    if (scopeResult.devices.length === 0) {
      message.error("当前设备范围没有可烧录的设备（需为收货入场状态）");
      return;
    }
    // validateFields 返回含保留字段的全部值；预览与提交共用同一快照，不依赖卸载字段的复读。
    setPendingValues(values);
    setPreviewOpen(true);
  };

  const confirmSubmit = () => {
    if (!pendingValues) return;
    const values = pendingValues;
    const scopeValue =
      values.scopeType === "batch"
        ? (values.batches ?? []).join("、")
        : values.scopeType === "sn_range"
          ? `${(values.snStart ?? "").trim()} ~ ${(values.snEnd ?? "").trim()}`
          : `${scopeResult.devices.length} 台`;
    setSubmitting(true);
    const result = deviceOpsStore.createFlashingTask({
      taskName: values.taskName,
      model: values.model,
      firmwareVersion: values.firmwareVersion ?? "",
      stations: values.stations,
      issueCert: values.issueCert,
      certTemplate: values.issueCert ? values.certTemplate : null,
      scopeType: values.scopeType,
      scopeValue,
      scopeSns: scopeResult.devices.map((device) => device.sn),
      retryLimit: values.retryLimit,
      remark: values.remark
    });
    setSubmitting(false);
    if (!result.ok) {
      message.error(`提交失败：${result.reason}`);
      return;
    }
    setPreviewOpen(false);
    message.success(`烧录任务 ${result.message} 已创建，返回列表可查看新记录`);
    navigate(backTo);
  };

  const previewValues = pendingValues;
  const previewStations = (previewValues?.stations ?? []).join("、");

  return (
    <div className="device-ops-stack">
      <header className="device-ops-detail-head">
        <div className="device-ops-detail-head__main">
          {backLink}
          <Typography.Title className="device-ops-title" level={1}>
            新建烧录任务
          </Typography.Title>
          <p className="device-ops-detail-head__sub">两步完成：先确定固件与工位，再圈定设备范围，提交前预览确认。</p>
        </div>
      </header>

      {readonly && <Alert showIcon title="当前账号为只读视角，表单仅供查看，不能提交" type="info" />}

      <section aria-label="分步进度" className="device-ops-panel flashing-steps">
        <Steps current={step} items={[{ title: "基础配置" }, { title: "设备范围" }]} size="small" />
      </section>

      <Form
        disabled={readonly}
        form={form}
        initialValues={{ issueCert: true, scopeType: "batch", retryLimit: 3 }}
        layout="vertical"
        scrollToFirstError
      >
        <section aria-label="基础配置" className={`device-ops-panel${step === 0 ? "" : " flashing-form-hidden"}`}>
            <h2 className="device-ops-group__title">基础配置</h2>
            <div className="device-ops-form-row">
              <Form.Item
                label="任务名称"
                name="taskName"
                rules={[
                  { required: true, whitespace: true, message: "请填写任务名称" },
                  { max: 64, message: "任务名称不超过 64 字" },
                  // 允许中间空格（只去首尾空格），种子「B2410 首批烧录」可触发查重。
                  { pattern: /^[一-龥A-Za-z0-9_\-. ]+$/, message: "任务名称仅支持中文、字母、数字、空格与 _-. 字符" },
                  {
                    validator: (_, value: string) =>
                      value && flashingTasks.some((task) => task.taskName === value.trim())
                        ? Promise.reject(new Error("任务名称已存在"))
                        : Promise.resolve()
                  }
                ]}
              >
                <Input maxLength={64} placeholder="如：B2411 首批烧录" />
              </Form.Item>
              <Form.Item label="机型" name="model" rules={[{ required: true, message: "请选择机型" }]}>
                <Select
                  onChange={() => form.setFieldValue("firmwareVersion", undefined)}
                  options={models.map((value) => ({ value, label: value }))}
                  placeholder="选择机型"
                />
              </Form.Item>
            </div>
            <div className="device-ops-form-row">
              <Form.Item
                extra={selectedVersion ? `${selectedVersion.releasedAt ?? "未发布"} 发布 · ${selectedVersion.changelog}` : undefined}
                label="固件版本"
                name="firmwareVersion"
                rules={[{ required: true, message: "请选择固件版本" }]}
              >
                <Select disabled={!model} options={versionOptions} placeholder={model ? "选择固件版本" : "请先选择机型"} />
              </Form.Item>
              <Form.Item
                label="烧录工位（1–20 个，仅在线工位）"
                name="stations"
                required
                rules={[
                  {
                    validator: (_, value: string[]) =>
                      !value || value.length < 1
                        ? Promise.reject(new Error("烧录工位至少选择 1 个"))
                        : value.length > 20
                          ? Promise.reject(new Error("最多同时选择 20 个工位"))
                          : Promise.resolve()
                  }
                ]}
              >
                <Select maxTagCount="responsive" mode="multiple" options={flashingStations.map((value) => ({ value, label: value }))} placeholder="选择在线烧录工位" />
              </Form.Item>
            </div>
            <div className="device-ops-form-row">
              <Form.Item label="是否签发证书" name="issueCert" valuePropName="checked">
                <Switch onChange={(checked) => { if (!checked) form.setFieldValue("certTemplate", undefined); }} />
              </Form.Item>
              {issueCert && (
                <Form.Item label="证书模板" name="certTemplate" rules={[{ required: true, message: "开启证书签发时证书模板必选" }]}>
                  <Select options={certTemplates.map((value) => ({ value, label: value }))} placeholder="选择证书模板" />
                </Form.Item>
              )}
            </div>
            {!issueCert && <Alert showIcon title="关闭证书签发后，设备无法完成完整身份绑定，请确认业务场景" type="warning" />}
        </section>

        <section aria-label="设备范围" className={`device-ops-panel${step === 1 ? "" : " flashing-form-hidden"}`}>
            <h2 className="device-ops-group__title">设备范围</h2>
            <Form.Item label="选择方式" name="scopeType" rules={[{ required: true, message: "请选择选择方式" }]}>
              <Radio.Group
                onChange={() => form.setFieldsValue({ batches: [], snStart: "", snEnd: "", snList: "" })}
                options={scopeTypeOptions}
              />
            </Form.Item>

            {scopeType === "batch" && (
              <Form.Item label="批次号（仅收货入场批次）" name="batches" rules={[{ required: true, message: "请选择批次号" }]}>
                <Select mode="multiple" options={receivedBatches.map((value) => ({ value, label: value }))} placeholder="选择批次号" />
              </Form.Item>
            )}
            {scopeType === "sn_range" && (
              <Form.Item label="SN 起止范围（字典序止 ≥ 起）" required>
                <div className="flashing-range">
                  <Form.Item name="snStart" noStyle rules={[{ required: true, message: "请填写起始 SN" }, { pattern: SN_PATTERN, message: "起始 SN 仅支持大写字母与数字" }]}>
                    <Input placeholder="起始 SN，如 TS24100437" />
                  </Form.Item>
                  <span className="device-ops-muted">至</span>
                  <Form.Item
                    dependencies={["snStart"]}
                    name="snEnd"
                    noStyle
                    rules={[
                      { required: true, message: "请填写截止 SN" },
                      { pattern: SN_PATTERN, message: "截止 SN 仅支持大写字母与数字" },
                      {
                        validator: (_, value: string) =>
                          value && snStart.trim() && value.trim() < snStart.trim() ? Promise.reject(new Error("截止 SN 需不小于起始 SN（字典序）")) : Promise.resolve()
                      }
                    ]}
                  >
                    <Input placeholder="截止 SN" />
                  </Form.Item>
                </div>
              </Form.Item>
            )}
            {scopeType === "sn_list" && (
              <Form.Item
                extra={scopeResult.errors.length > 0 ? undefined : "每行一个 SN，最多 500 台；提交时校验全部 SN 存在且为收货入场状态。"}
                label="SN 列表"
                name="snList"
                rules={[{ required: true, message: "请粘贴 SN 列表" }]}
                validateStatus={scopeResult.errors.length > 0 ? "error" : undefined}
                help={scopeResult.errors[0]}
              >
                <Input.TextArea placeholder={"TS24100437\nTS24100451"} rows={6} />
              </Form.Item>
            )}
            <p className="flashing-scope-preview" aria-live="polite">
              当前选择命中可烧录设备 <strong className="device-ops-num">{scopeResult.devices.length}</strong> 台
              {scopeType === "batch" && scopeBatches.length > 0 && <span className="device-ops-muted">（批次内收货入场设备）</span>}
            </p>

            <div className="device-ops-form-row">
              <Form.Item
                extra="设备失败重试达到该上限后将进入报废流程，请谨慎设置。"
                label="重试上限（1–10 次）"
                name="retryLimit"
                rules={[
                  { required: true, message: "请设置重试上限" },
                  {
                    validator: (_, value: number) =>
                      Number.isInteger(value) && value >= 1 && value <= 10
                        ? Promise.resolve()
                        : Promise.reject(new Error("重试上限最大 10 次，超限设备将自动进入报废流程"))
                  }
                ]}
              >
                <InputNumber max={10} min={1} precision={0} />
              </Form.Item>
              <Form.Item label="备注" name="remark" rules={[{ max: 200, message: "备注不超过 200 字" }]}>
                <Input.TextArea maxLength={200} placeholder="选填，记录本次任务背景" rows={2} showCount />
              </Form.Item>
            </div>
        </section>
      </Form>

      <footer className="device-ops-panel flashing-form-actions">
        {step === 0 ? (
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
              "production:flashing:create",
              <Button disabled={readonly} onClick={goNext} type="primary">
                下一步
              </Button>
            )}
          </Space>
        ) : (
          <Space size={8} wrap>
            <Button onClick={() => setStep(0)}>上一步</Button>
            {guard(
              "production:flashing:create",
              <Button disabled={readonly} onClick={submit} type="primary">
                提交
              </Button>
            )}
          </Space>
        )}
      </footer>

      {/* 提交预览 C 档确认：只读摘要，返回修改 / 确认提交 */}
      <Modal
        cancelText="返回修改"
        confirmLoading={submitting}
        destroyOnHidden
        okText="确认提交"
        onCancel={() => setPreviewOpen(false)}
        onOk={confirmSubmit}
        open={previewOpen}
        title="确认提交烧录任务"
        width={560}
      >
        {previewValues && (
          <Descriptions
            column={1}
            items={[
              { key: "name", label: "任务名称", children: previewValues.taskName },
              { key: "model", label: "机型", children: previewValues.model },
              { key: "firmware", label: "固件版本", children: previewValues.firmwareVersion },
              { key: "template", label: "证书模板", children: previewValues.issueCert ? previewValues.certTemplate : "不签发证书" },
              { key: "stations", label: "烧录工位", children: `${previewStations}（共 ${(previewValues.stations ?? []).length} 个）` },
              { key: "scope", label: "设备范围", children: scopeTypeOptions.find((item) => item.value === previewValues.scopeType)?.label },
              { key: "count", label: "设备数量", children: `${scopeResult.devices.length} 台` },
              { key: "retry", label: "重试上限", children: `${previewValues.retryLimit} 次` },
              { key: "cert", label: "是否签发证书", children: previewValues.issueCert ? "签发" : "不签发" }
            ]}
            size="small"
          />
        )}
      </Modal>
    </div>
  );
}
