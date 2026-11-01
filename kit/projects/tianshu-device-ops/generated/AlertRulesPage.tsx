import { useMemo, useState, type ReactElement } from "react";
import {
  Alert,
  App,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Segmented,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType
} from "antd";
import { ArrowLeftOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  alertTypeLabel,
  batches,
  describeAlertRule,
  models,
  staffOptions,
  type AlertRule,
  type AlertRuleType
} from "../data";
import { deviceOpsStore, useDeviceOpsState, type AlertRuleForm } from "../store";
import { appPath, safeReturnTo, useDataState, usePermission, useQueryParams, useRouter } from "../ui";
import "./alert-rules.css";
import {
  ALERT_RULE_EDIT_PERMISSION,
  RULE_PAGE_SIZE,
  compareAlertRules,
  deriveAlertRules,
  latestAlertByRule,
  pushTaskScopeOptions,
  ruleScopeOptions,
  ruleTypeFilterOptions,
  ruleTypeFormOptions
} from "../core/alertRules";

type StatusFilter = "all" | "enabled" | "disabled";
type DrawerState = { mode: "create"; rule: null } | { mode: "edit"; rule: AlertRule };

// 编辑与启停复用 create 权限点（2026-09-29 页面卡 · 页 10 裁决：不新增权限点）。
const EDIT_PERMISSION = ALERT_RULE_EDIT_PERMISSION;

// 范围交给表单校验而不是 InputNumber min/max：antd 的 min/max 会在失焦时把越界值直接夹回边界，
// 「填 0 被拦并提示范围 1–100」就走不到了；校验拦截 + store 二次校验是双保险。
const integerRangeRule = (min: number, max: number, label: string) => ({
  validator: (_: unknown, value: number | undefined | null) =>
    value === undefined || value === null
      ? Promise.reject(new Error(`请填写${label}`))
      : Number.isInteger(value) && value >= min && value <= max
        ? Promise.resolve()
        : Promise.reject(new Error(`${label}需为 ${min}–${max} 的整数`))
});

type RuleFormValues = {
  type: AlertRuleType;
  scope?: "model" | "batch";
  target?: string;
  thresholdPct?: number;
  offlineDays?: number;
  pushTaskScope?: "all" | "specified";
  pushTaskIds?: string[];
  notifyUsers: string[];
  name: string;
};

type RuleDrawerProps = {
  state: DrawerState;
  onClose: () => void;
};

function RuleDrawer({ state, onClose }: RuleDrawerProps) {
  const { message } = App.useApp();
  const { readonly, guard } = usePermission();
  const { pushTasks } = useDeviceOpsState();
  const [form] = Form.useForm<RuleFormValues>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 「取消有改动弹气泡」的 dirty 标志：antd Form 是外部 store，isFieldsTouched() 在渲染期是旧值，
  // 用 onValuesChange（用户输入才触发，setFieldsValue 不触发）驱动一次 re-render。
  const [dirty, setDirty] = useState(false);
  const watchedType = Form.useWatch("type", form);
  const watchedScope = Form.useWatch("scope", form);
  const watchedTaskScope = Form.useWatch("pushTaskScope", form);
  const editing = state.mode === "edit" ? state.rule : null;

  const targetOptions: { value: string; label: string }[] =
    watchedScope === "model"
      ? models.map((value) => ({ value, label: value }))
      : watchedScope === "batch"
        ? batches.map((value) => ({ value, label: value }))
        : [];
  const pushTaskOptions = pushTasks.map((task) => ({ value: task.id, label: task.name }));

  const initialValues: Partial<RuleFormValues> = editing
    ? {
        type: editing.type,
        scope: editing.scope ?? undefined,
        target: editing.target ?? undefined,
        thresholdPct: editing.thresholdPct ?? undefined,
        offlineDays: editing.offlineDays ?? undefined,
        pushTaskScope: editing.pushTaskScope ?? undefined,
        pushTaskIds: editing.pushTaskIds,
        notifyUsers: editing.notifyUsers,
        name: editing.name
      }
    : { pushTaskIds: [], notifyUsers: [] };

  // 切换类型：保留规则名称与通知对象，清空并卸载不相关字段，避免残留值被一起提交。
  const onTypeChange = () => {
    form.setFieldsValue({
      scope: undefined,
      target: undefined,
      thresholdPct: undefined,
      offlineDays: undefined,
      pushTaskScope: undefined,
      pushTaskIds: []
    });
    setSaveError(null);
  };

  const submit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values || !values.type) return;
    setSaveError(null);
    setSaving(true);
    // 模拟提交往返：保存中按钮 loading 防重复点击，与「提交中」口径一致。
    await new Promise((resolve) => setTimeout(resolve, 350));
    const payload: AlertRuleForm = {
      name: values.name,
      type: values.type,
      notifyUsers: values.notifyUsers,
      ...(values.type === "offline_rate_exceeded"
        ? { scope: values.scope, target: values.target, thresholdPct: values.thresholdPct }
        : {}),
      ...(values.type === "offline_duration_exceeded" ? { offlineDays: values.offlineDays } : {}),
      ...(values.type === "upgrade_fail_rate_exceeded"
        ? {
            thresholdPct: values.thresholdPct,
            pushTaskScope: values.pushTaskScope,
            pushTaskIds: values.pushTaskScope === "specified" ? (values.pushTaskIds ?? []) : []
          }
        : {})
    };
    const result = editing ? deviceOpsStore.updateRule(editing.id, payload) : deviceOpsStore.createRule(payload);
    setSaving(false);
    if (!result.ok) {
      // 保存失败抽屉不关、顶部错误条说明原因，界面状态不回退。
      setSaveError(result.reason);
      return;
    }
    message.success(result.message ?? "规则已保存");
    onClose();
  };

  const cancelButton = dirty ? (
    <Popconfirm cancelText="继续填写" description="当前填写的内容不会被保存。" okText="放弃" onConfirm={onClose} title="放弃未保存内容？">
      <Button>取消</Button>
    </Popconfirm>
  ) : (
    <Button onClick={onClose}>取消</Button>
  );

  return (
    <Drawer
      destroyOnHidden
      footer={
        <Space size={8}>
          {cancelButton}
          {guard(
            EDIT_PERMISSION,
            <Button disabled={readonly} loading={saving} onClick={submit} type="primary">
              保存
            </Button>
          )}
        </Space>
      }
      mask={{ closable: false }}
      onClose={onClose}
      open
      title={editing ? "编辑告警规则" : "新建告警规则"}
      size={480}
    >
      {saveError && <Alert className="alert-rules-save-error" description={saveError} showIcon title="规则保存失败" type="error" />}
      <Form form={form} initialValues={initialValues} layout="vertical" onValuesChange={() => setDirty(true)}>
        <Form.Item label="规则类型" name="type" rules={[{ required: true, message: "请选择规则类型" }]}>
          <Select disabled={Boolean(editing)} onChange={onTypeChange} options={ruleTypeFormOptions} placeholder="选择规则类型" />
        </Form.Item>

        {watchedType === "offline_rate_exceeded" && (
          <>
            <Form.Item label="适用范围" name="scope" rules={[{ required: true, message: "请选择适用范围" }]}>
              <Select onChange={() => form.setFieldValue("target", undefined)} options={[...ruleScopeOptions]} placeholder="机型 / 批次" />
            </Form.Item>
            <Form.Item label="目标对象" name="target" rules={[{ required: true, message: "请选择目标对象" }]}>
              <Select disabled={!watchedScope} options={targetOptions} placeholder={watchedScope ? "请选择目标对象" : "请先选择适用范围"} />
            </Form.Item>
            <Form.Item label="阈值（%）" name="thresholdPct" required rules={[integerRangeRule(1, 100, "阈值")]}>
              <InputNumber className="device-ops-full" precision={0} placeholder="1–100 的整数" />
            </Form.Item>
          </>
        )}

        {watchedType === "offline_duration_exceeded" && (
          <Form.Item label="N（离线天数，天）" name="offlineDays" required rules={[integerRangeRule(1, 90, "离线天数")]}>
            <InputNumber className="device-ops-full" precision={0} placeholder="1–90 的整数" />
          </Form.Item>
        )}

        {watchedType === "upgrade_fail_rate_exceeded" && (
          <>
            <Form.Item label="阈值（%）" name="thresholdPct" required rules={[integerRangeRule(1, 100, "阈值")]}>
              <InputNumber className="device-ops-full" precision={0} placeholder="1–100 的整数" />
            </Form.Item>
            <Form.Item label="关联推送任务范围" name="pushTaskScope" rules={[{ required: true, message: "请选择推送任务范围" }]}>
              <Select onChange={() => form.setFieldValue("pushTaskIds", [])} options={[...pushTaskScopeOptions]} placeholder="全部任务 / 指定任务" />
            </Form.Item>
            {watchedTaskScope === "specified" && (
              <Form.Item label="推送任务" name="pushTaskIds" rules={[{ required: true, message: "指定任务时至少选择 1 个推送任务" }]}>
                <Select maxTagCount="responsive" mode="multiple" options={pushTaskOptions} placeholder="从推送任务列表中选择" showSearch={{ optionFilterProp: "label" }} />
              </Form.Item>
            )}
          </>
        )}

        <Form.Item label="通知对象" name="notifyUsers" rules={[{ required: true, message: "请选择通知对象" }]}>
          <Select maxTagCount="responsive" mode="multiple" options={staffOptions} placeholder="选择接收站内信的人员" />
        </Form.Item>
        <Form.Item
          label="规则名称"
          name="name"
          rules={[
            { required: true, whitespace: true, message: "请填写规则名称" },
            { max: 50, message: "规则名称不超过 50 字" }
          ]}
        >
          <Input maxLength={50} placeholder="例如：B2411 批次离线率 ≥10%" showCount />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

export function AlertRulesPage() {
  const { message } = App.useApp();
  const { navigate, search } = useRouter();
  const params = useQueryParams();
  const dataState = useDataState();
  const { readonly, guard } = usePermission();
  const { alertRules, alerts, pushTasks } = useDeviceOpsState();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<AlertRuleType | undefined>();
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  // 从告警处置「触发规则」进入：?rule=<id> 定位行高亮，from 驱动「返回告警处置」。
  const focusRuleId = params.get("rule");
  const returnTo = safeReturnTo(params.get("from"));
  const fromAlerts = returnTo?.startsWith(appPath("/alerts")) ?? false;

  // 规则数少（个位到两位数），实时过滤，不放「查询 / 重置」（interaction-decisions §2）；
  // Segmented 计数按当前类型筛选重算。
  const { counts, rows } = useMemo(
    () => deriveAlertRules({ rules: alertRules, typeFilter, statusFilter }),
    [alertRules, typeFilter, statusFilter]
  );

  const latestByRule = useMemo(() => latestAlertByRule(alerts), [alerts]);

  const openCreate = () => setDrawer({ mode: "create", rule: null });

  const applyEnabled = (id: string, enabled: boolean) => {
    const result = deviceOpsStore.setRuleEnabled(id, enabled);
    if (result.ok) message.success(result.message ?? (enabled ? "已启用，按最新配置生效" : "已停用"));
    else message.error(`操作失败：${result.reason}，规则状态未变化`);
  };

  // 停用 = B 档气泡确认：写清对象与后果（停用期间的告警不会补发）。
  const renderDisableConfirm = (rule: AlertRule, node: ReactElement) => (
    <Popconfirm
      cancelText="取消"
      description={`停用「${rule.name}」后不再触发新告警，停用期间的告警不会补发。`}
      okText="确认停用"
      onConfirm={() => applyEnabled(rule.id, false)}
      title="停用这条规则？"
    >
      {node}
    </Popconfirm>
  );

  const clearFilters = () => {
    setStatusFilter("all");
    setTypeFilter(undefined);
  };

  const retry = () => {
    const next = new URLSearchParams(search);
    next.delete("dataState");
    navigate(`${appPath("/system/alert-rules")}${next.size ? `?${next}` : ""}`);
  };

  const columns: TableColumnsType<AlertRule> = [
    {
      title: "规则名称",
      dataIndex: "name",
      key: "name",
      width: 200,
      render: (name: string) => <Typography.Text>{name}</Typography.Text>
    },
    {
      title: "规则类型",
      dataIndex: "type",
      key: "type",
      // PRD ⑦：规则类型为非颜色状态，Tag 中性 default。
      render: (type: AlertRuleType) => <Tag>{alertTypeLabel[type]}</Tag>,
      width: 140
    },
    {
      title: "触发条件摘要",
      key: "condition",
      render: (_: unknown, rule) => describeAlertRule(rule, pushTasks)
    },
    {
      title: "通知对象",
      key: "notifyUsers",
      render: (_: unknown, rule) => {
        const full = rule.notifyUsers.join("、");
        const first = rule.notifyUsers.length <= 2 ? full : `${rule.notifyUsers.slice(0, 2).join("、")} 等 ${rule.notifyUsers.length} 人`;
        return (
          <Tooltip title={full}>
            <span className="alert-rules-notify">
              <span className="alert-rules-notify__full">{first}</span>
              <span className="alert-rules-notify__short">{rule.notifyUsers.length} 人</span>
            </span>
          </Tooltip>
        );
      },
      width: 170
    },
    {
      title: "启用状态",
      key: "enabled",
      render: (_: unknown, rule) => (
        <span className="alert-rules-switch">
          {readonly
            ? guard(EDIT_PERMISSION, <Switch checked={rule.enabled} disabled />)
            : rule.enabled
              ? renderDisableConfirm(rule, <Switch checked />)
              : <Switch checked={false} onChange={() => applyEnabled(rule.id, true)} />}
          <Typography.Text type={rule.enabled ? "success" : "secondary"}>{rule.enabled ? "启用中" : "已停用"}</Typography.Text>
        </span>
      ),
      width: 120
    },
    {
      title: "最近触发时间",
      key: "lastTriggeredAt",
      render: (_: unknown, rule) => {
        if (!rule.lastTriggeredAt) return <span className="device-ops-muted">—</span>;
        const latest = latestByRule.get(rule.id);
        return (
          <span className="alert-rules-trigger">
            <span className="device-ops-num">{rule.lastTriggeredAt}</span>
            {latest && (
              <a href={`${appPath("/alerts")}?tab=${latest.status}&id=${encodeURIComponent(latest.id)}`}>
                {latest.id}
              </a>
            )}
          </span>
        );
      },
      width: 170
    },
    {
      title: "操作",
      key: "actions",
      className: "device-ops-col-actions",
      // 行内操作平铺不设更多菜单；本页只有停用没有删除（PRD 口径）。
      render: (_: unknown, rule) => (
        <Space size={0}>
          {guard(
            EDIT_PERMISSION,
            <Button disabled={readonly} onClick={() => setDrawer({ mode: "edit", rule })} size="small" type="link">
              编辑
            </Button>
          )}
          {rule.enabled &&
            (readonly
              ? guard(
                  EDIT_PERMISSION,
                  <Button disabled size="small" type="link">
                    停用
                  </Button>
                )
              : renderDisableConfirm(
                  rule,
                  <Button size="small" type="link">
                    停用
                  </Button>
                ))}
          {!rule.enabled &&
            guard(
              EDIT_PERMISSION,
              // 启用 = A 档直接执行，立即按最新配置生效。
              <Button disabled={readonly} onClick={() => applyEnabled(rule.id, true)} size="small" type="link">
                启用
              </Button>
            )}
        </Space>
      ),
      width: 110
    }
  ];

  const emptyText =
    dataState === "empty" ? (
      <Empty
        description={
          <span>
            暂无告警规则，点击右上角『新建规则』开始
            <div className="alert-rules-empty-action">
              {guard(
                EDIT_PERMISSION,
                <Button disabled={readonly} icon={<PlusOutlined aria-hidden="true" aria-label={undefined} />} onClick={openCreate} type="primary">
                  新建规则
                </Button>
              )}
            </div>
          </span>
        }
      />
    ) : (
      <Empty description="没有符合条件的告警规则，请调整筛选条件后重新查询">
        <Button onClick={clearFilters}>重置筛选</Button>
      </Empty>
    );

  return (
    <div className="device-ops-stack">
      <header className="alert-rules-head">
        {fromAlerts && (
          <a className="device-ops-back" href={returnTo ?? appPath("/alerts")}>
            <ArrowLeftOutlined aria-hidden="true" aria-label={undefined} />
            返回告警处置
          </a>
        )}
        <div className="device-ops-title-row">
          <h1 className="device-ops-title">告警规则</h1>
        </div>
        {/* 页头副标题引 PRD 口径原文，Switch 的后果不用猜。 */}
        <p className="device-ops-muted alert-rules-subtitle">
          规则触发后通过站内信通知；停用不删除历史触发记录，启用立即按最新配置生效，不回溯停用期间数据。
        </p>
      </header>

      <section aria-label="告警规则列表" className="device-ops-panel device-ops-panel--table">
        <div className="device-ops-toolbar">
          <Space size={16} wrap>
            <Segmented
              onChange={(value) => setStatusFilter(value as StatusFilter)}
              options={[
                { value: "all", label: `全部（${counts.all}）` },
                { value: "enabled", label: `启用中（${counts.enabled}）` },
                { value: "disabled", label: `已停用（${counts.disabled}）` }
              ]}
              value={statusFilter}
            />
            <Select
              allowClear
              aria-label="按规则类型筛选"
              className="alert-rules-type-filter"
              onChange={(value: AlertRuleType | undefined) => setTypeFilter(value)}
              options={ruleTypeFilterOptions}
              placeholder="全部类型"
              value={typeFilter}
            />
          </Space>
          <Space size={8} wrap>
            <Button
              icon={<ReloadOutlined aria-hidden="true" aria-label={undefined} />}
              onClick={() => message.success("已刷新")}
              type="text"
            >
              刷新
            </Button>
            {guard(
              EDIT_PERMISSION,
              <Button disabled={readonly} icon={<PlusOutlined aria-hidden="true" aria-label={undefined} />} onClick={openCreate} type="primary">
                新建规则
              </Button>
            )}
          </Space>
        </div>

        {dataState === "error" ? (
          <Alert
            action={
              <Button onClick={retry} size="small">
                重试
              </Button>
            }
            description="网络异常或服务暂时不可用，请稍后重试。"
            showIcon
            title="告警规则加载失败"
            type="error"
          />
        ) : dataState === "loading" ? (
          <Skeleton active paragraph={{ rows: 6 }} title={false} />
        ) : (
          <Table<AlertRule>
            columns={columns}
            dataSource={dataState === "empty" ? [] : rows}
            locale={{ emptyText }}
            pagination={{ hideOnSinglePage: true, pageSize: RULE_PAGE_SIZE, showTotal: (count) => `共 ${count} 条` }}
            rowClassName={(record) => (focusRuleId === record.id ? "alert-rules-row--focus" : "")}
            rowKey="id"
            scroll={{ x: 1040 }}
            tableLayout="fixed"
          />
        )}
      </section>

      {drawer && <RuleDrawer onClose={() => setDrawer(null)} state={drawer} />}
    </div>
  );
}
