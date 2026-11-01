import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
  type TableColumnsType
} from "antd";
import {
  ArrowLeftOutlined,
  DownOutlined,
  DownloadOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  UpOutlined,
  UserOutlined
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import {
  NOW_LABEL,
  feedbackStatusMeta,
  firmwareVersions,
  isFeedbackOpen,
  maskPhone,
  slaRemainingLabel,
  slaStateOf,
  staffOptions,
  toLinearMinutes,
  type FeedbackFlowEntry,
  type FeedbackPriority,
  type FeedbackReply,
  type FeedbackTicket,
  type FeedbackStatus,
  type FeedbackType
} from "../data";
import { deviceOpsStore, useDeviceOpsState, type ActionResult, type FeedbackManualForm } from "../store";
import {
  FeedbackStatusTag,
  FeedbackTypeTag,
  SnLink,
  appPath,
  returnUrlFrom,
  safeReturnTo,
  useDataState,
  usePermission,
  useQueryParams,
  useRouter
} from "../ui";
import "./feedback.css";
import {
  ALL_COLUMN_KEYS,
  COLUMN_LABELS,
  FEEDBACK_STORAGE_KEYS,
  FIXED_COLUMN_KEYS,
  PRIORITY_OPTIONS,
  SLA_STATE_OPTIONS,
  STATUS_TABS,
  TYPE_OPTIONS,
  collectAppVersionOptions,
  countActiveMoreFilters,
  defaultAssigneeValue,
  exportBlockedReason,
  filterPrefToStore,
  initialFeedbackFilters,
  initialFeedbackState,
  initialVisibleColumns,
  isTicketIdOnlySearch,
  matchesFeedbackFilters,
  normalizeManualForm,
  overdueOpenCount,
  statusTabCounts,
  statusesForTab,
  tabKeyForStatuses,
  type FeedbackColumnKey,
  type FeedbackFilters,
  type FeedbackTabKey
} from "../core/feedback";

// —— 客户反馈（2026-09-29 批 2 页面卡 · 页 9）——
// 路由 /exceptions/feedback，列表 + 详情抽屉形态。
// 依据：PRD「平台共享能力·客户反馈」①–⑦、审定裁决（优先级灰阶、B档气泡回复、超时 warning Banner）。

const DASH = "—";

type Filters = FeedbackFilters;
type ColumnKey = FeedbackColumnKey;

// 固定必显列置灰不可取消；操作列不在可选集内，始终显示。
const COLUMN_GROUP_OPTIONS = ALL_COLUMN_KEYS.map((key) => ({
  value: key,
  disabled: FIXED_COLUMN_KEYS.includes(key),
  label: FIXED_COLUMN_KEYS.includes(key) ? `${COLUMN_LABELS[key]}（固定必显）` : COLUMN_LABELS[key]
}));

export function FeedbackPage() {
  const { message } = App.useApp();
  const { navigate, search, pathname } = useRouter();
  const params = useQueryParams();
  const returnUrl = returnUrlFrom("/exceptions/feedback", params.toString() ? `?${params}` : "");
  const dataState = useDataState();
  const { readonly, guard } = usePermission();
  const { feedbackTickets, devices } = useDeviceOpsState();

  const isForbidden = params.get("perm") === "forbidden";
  const fromUrl = safeReturnTo(params.get("from"));

  // SLA 重算机制（批 2 裁决 2）：种子以 NOW_LABEL 为固定基准保证截图可复现；
  // 前端每 60 秒本地重算一次剩余时效，不重发请求。
  const [, setSlaTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setSlaTick((tick) => tick + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // 初始筛选记忆加载（排除隐私字段 sn 与 assignee）
  const [filters, setFilters] = useState<Filters>(
    () => initialFeedbackState({ search, storage: window.localStorage, now: Date.now() }).filters
  );

  const [appliedFilters, setAppliedFilters] = useState<Filters>(filters);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // 列设置（Popover 勾选，固定必显列置灰，偏好写 localStorage）
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<ColumnKey[]>(() => initialVisibleColumns(window.localStorage));

  // 批量选择
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  // 抽屉与弹窗状态
  const [currentTicketId, setCurrentTicketId] = useState<string | null>(params.get("ticket") ?? null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTargetIds, setAssignTargetIds] = useState<string[]>([]);
  const [assigneeSelect, setAssigneeSelect] = useState<string>("");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [replyDrawerOpen, setReplyDrawerOpen] = useState(false);
  const [replyForm] = Form.useForm<{ content: string; markAwaiting: boolean }>();

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectForm] = Form.useForm<{ reason: string }>();

  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [ticketToClose, setTicketToClose] = useState<FeedbackTicket | null>(null);

  const [createForm] = Form.useForm<FeedbackManualForm>();

  // URL ticket 参数变化时联动打开详情抽屉
  useEffect(() => {
    const ticketParam = params.get("ticket");
    if (ticketParam) {
      setCurrentTicketId(ticketParam);
    }
  }, [params]);

  // 从用户与绑定「为该用户新建客户反馈工单」进入（?create=1）：直接打开代录弹窗并预填上下文
  // （用户 ID / 脱敏手机号 / SN / App 版本），手机号沿用带来值不还原明文。
  useEffect(() => {
    if (params.get("create") !== "1") return;
    createForm.setFieldsValue({
      userId: params.get("userId") ?? undefined,
      contact: params.get("phone") ?? undefined,
      sn: params.get("sn") ?? undefined,
      appVersion: params.get("appVersion") ?? undefined
    });
    setCreateModalOpen(true);
    // 只响应一次进入，避免用户编辑中被覆盖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 从工单提取 App 版本选项
  const appVersionOptions = useMemo(() => collectAppVersionOptions(feedbackTickets), [feedbackTickets]);

  // 保存筛选偏好（不记隐私字段）
  const saveFilterPref = (next: Filters) => {
    try {
      localStorage.setItem(FEEDBACK_STORAGE_KEYS.filter, JSON.stringify(filterPrefToStore(next, Date.now())));
    } catch {
      // 忽略
    }
  };

  // 编号精确单查时，其余字段置灰禁用
  const isTicketIdSearchActive = isTicketIdOnlySearch(filters);

  // 活跃收纳筛选项计数
  const activeMoreFiltersCount = useMemo(() => countActiveMoreFilters(filters), [filters]);

  // Tab 与状态筛选双向联动
  const activeTabKey = useMemo(() => tabKeyForStatuses(appliedFilters.statuses), [appliedFilters.statuses]);

  const handleTabChange = (key: string) => {
    const nextStatus = statusesForTab(key as FeedbackTabKey);
    const next = { ...appliedFilters, statuses: nextStatus };
    setFilters((prev) => ({ ...prev, statuses: nextStatus }));
    setAppliedFilters(next);
    saveFilterPref(next);
  };

  // 查询与重置
  const handleSearch = () => {
    setAppliedFilters(filters);
    saveFilterPref(filters);
    setSelectedRowKeys([]);
  };

  const handleReset = () => {
    const next: Filters = { ...initialFeedbackFilters };
    setFilters(next);
    setAppliedFilters(next);
    saveFilterPref(next);
    setSelectedRowKeys([]);
  };

  // 计算 Tab 上的计数（排除状态筛选，计算其他条件匹配下各状态数量）
  const tabCounts = useMemo(() => statusTabCounts(feedbackTickets, appliedFilters), [feedbackTickets, appliedFilters]);

  // 过滤工单数据
  const filteredTickets = useMemo(
    () => feedbackTickets.filter((ticket) => matchesFeedbackFilters(ticket, appliedFilters)),
    [feedbackTickets, appliedFilters]
  );

  // 超时工单计数与 Banner 控制
  const overdueCount = useMemo(() => overdueOpenCount(filteredTickets), [filteredTickets]);

  const currentTicket = useMemo(() => {
    return feedbackTickets.find((t) => t.id === currentTicketId) ?? null;
  }, [feedbackTickets, currentTicketId]);

  // 操作处理函数
  const handleReceive = (id: string) => {
    const res: ActionResult = deviceOpsStore.receiveTicket(id);
    if (res.ok) {
      message.success(res.message ?? "已受理，SLA 首次响应计时停止");
    } else {
      message.error(res.reason ?? "受理失败");
    }
  };

  const handleOpenReply = (ticket: FeedbackTicket) => {
    setCurrentTicketId(ticket.id);
    replyForm.resetFields();
    replyForm.setFieldsValue({ content: "", markAwaiting: true });
    setReplyDrawerOpen(true);
  };

  const handleConfirmReply = async () => {
    try {
      const values = await replyForm.validateFields();
      if (!currentTicketId) return;
      const res: ActionResult = deviceOpsStore.replyTicket(currentTicketId, {
        content: values.content,
        markAwaiting: values.markAwaiting
      });
      if (res.ok) {
        message.success(res.message ?? "已回复用户");
        setReplyDrawerOpen(false);
      } else {
        message.error(res.reason ?? "回复失败");
      }
    } catch {
      // 校验失败
    }
  };

  const handleResolve = (id: string) => {
    const res: ActionResult = deviceOpsStore.resolveTicket(id);
    if (res.ok) {
      message.success(res.message ?? "已标记为已解决，SLA 计时停止");
    } else {
      message.error(res.reason ?? "标记失败");
    }
  };

  const handleOpenCloseModal = (ticket: FeedbackTicket) => {
    setTicketToClose(ticket);
    setCloseModalOpen(true);
  };

  const handleConfirmClose = () => {
    if (!ticketToClose) return;
    const res: ActionResult = deviceOpsStore.closeTicket(ticketToClose.id);
    if (res.ok) {
      message.success(res.message ?? `工单 ${ticketToClose.id} 已关闭`);
      setCloseModalOpen(false);
      setTicketToClose(null);
    } else {
      message.error(res.reason ?? "关闭失败");
    }
  };

  const handleOpenReject = (ticket: FeedbackTicket) => {
    setCurrentTicketId(ticket.id);
    rejectForm.resetFields();
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    try {
      const values = await rejectForm.validateFields();
      if (!currentTicketId) return;
      const res: ActionResult = deviceOpsStore.rejectTicket(currentTicketId, { reason: values.reason });
      if (res.ok) {
        message.success(res.message ?? "工单已驳回，进入终态仅可查看");
        setRejectModalOpen(false);
      } else {
        message.error(res.reason ?? "驳回失败");
      }
    } catch {
      // 校验失败
    }
  };

  const handleOpenAssign = (ids: string[]) => {
    setAssignTargetIds(ids);
    setAssigneeSelect(defaultAssigneeValue(staffOptions));
    setAssignModalOpen(true);
  };

  const handleConfirmAssign = () => {
    if (!assigneeSelect || assignTargetIds.length === 0) return;
    const res: ActionResult = deviceOpsStore.assignTickets(assignTargetIds, assigneeSelect);
    if (res.ok) {
      message.success(res.message ?? "指派成功");
      setAssignModalOpen(false);
      setSelectedRowKeys([]);
    } else {
      message.error(res.reason ?? "指派失败");
    }
  };

  const handleCreateManual = async () => {
    try {
      const values = await createForm.validateFields();
      // SN 校验按去首尾空格后的值判断，提交保持同口径；选填项空串按未填处理（空联系方式 / App 版本回退绑定用户数据）。
      const res: ActionResult = deviceOpsStore.createManualTicket(normalizeManualForm(values));
      if (res.ok) {
        const newId = res.message;
        message.success(`工单代录成功，工单号：${newId}`);
        setCreateModalOpen(false);
        createForm.resetFields();
        if (newId) setCurrentTicketId(newId);
      } else {
        message.error(res.reason ?? "代录失败");
      }
    } catch {
      // 校验失败
    }
  };

  const handleExport = () => {
    const blocked = exportBlockedReason(filteredTickets.length);
    if (blocked) {
      message.warning(blocked);
      return;
    }
    message.success("已创建异步导出任务，工单数据生成后将通过站内信通知下载");
  };

  const handleRefresh = () => {
    const next = new URLSearchParams(search);
    next.delete("dataState");
    navigate(`${appPath("/exceptions/feedback")}${next.size ? `?${next}` : ""}`);
    message.info("已刷新工单数据");
  };

  const handleGoRma = (ticket: FeedbackTicket) => {
    const targetSn = ticket.sn ? encodeURIComponent(ticket.sn) : "";
    const sourceFeedback = encodeURIComponent(ticket.id);
    navigate(appPath(`/exceptions/rma?new=1&sn=${targetSn}&source_feedback=${sourceFeedback}`));
  };

  // 列定义
  const allColumns: Record<ColumnKey, TableColumnsType<FeedbackTicket>[number]> = {
    id: {
      title: "反馈编号",
      dataIndex: "id",
      key: "id",
      width: 190,
      render: (id: string, record: FeedbackTicket) => (
        <Typography.Link onClick={() => setCurrentTicketId(record.id)}>
          {id}
        </Typography.Link>
      )
    },
    type: {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 90,
      render: (type: FeedbackType) => <FeedbackTypeTag value={type} />
    },
    priority: {
      title: "优先级",
      dataIndex: "priority",
      key: "priority",
      width: 85,
      sorter: (a, b) => a.priority.localeCompare(b.priority),
      render: (priority: FeedbackPriority) => (
        <span className={`feedback-priority feedback-priority--${priority.toLowerCase()}`}>
          {priority}
        </span>
      )
    },
    status: {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 105,
      render: (status: FeedbackStatus) => <FeedbackStatusTag value={status} />
    },
    sn: {
      title: "关联 SN",
      dataIndex: "sn",
      key: "sn",
      width: 155,
      render: (sn: string | null) => (sn ? <SnLink from={returnUrl} sn={sn} /> : <span className="device-ops-muted">{DASH}</span>)
    },
    appVersion: {
      title: "App 版本",
      dataIndex: "appVersion",
      key: "appVersion",
      width: 95,
      render: (ver: string | null) => ver || <span className="device-ops-muted">{DASH}</span>
    },
    firmware: {
      title: "固件版本",
      dataIndex: "firmware",
      key: "firmware",
      width: 95,
      render: (firmware: string | null) => firmware || <span className="device-ops-muted">{DASH}</span>
    },
    contact: {
      title: "联系方式",
      dataIndex: "contact",
      key: "contact",
      width: 120,
      render: (contact: string | null) =>
        // 恒脱敏：按无 platform:feedback:view_sensitive 处理，不提供「查看完整」入口
        contact ? maskPhone(contact) : <span className="device-ops-muted">{DASH}</span>
    },
    assignee: {
      title: "处理人",
      dataIndex: "assignee",
      key: "assignee",
      width: 115,
      render: (assignee: string | null) =>
        assignee ? assignee : <span className="device-ops-muted">待指派</span>
    },
    sla: {
      title: "SLA 剩余时间",
      key: "sla",
      width: 140,
      defaultSortOrder: "ascend",
      sorter: (a, b) => {
        const deltaA = toLinearMinutes(a.slaDeadlineAt) - (a.resolvedAt ? toLinearMinutes(a.resolvedAt) : toLinearMinutes(NOW_LABEL));
        const deltaB = toLinearMinutes(b.slaDeadlineAt) - (b.resolvedAt ? toLinearMinutes(b.resolvedAt) : toLinearMinutes(NOW_LABEL));
        return deltaA - deltaB;
      },
      render: (_: unknown, record: FeedbackTicket) => {
        const state = slaStateOf(record);
        const label = slaRemainingLabel(record);
        const settled = !isFeedbackOpen(record);
        return (
          <span className={`feedback-sla-time feedback-sla-time--${state}`}>
            {label}
            {record.status === "pending" && <span className="feedback-sla-settled">（首次响应）</span>}
            {settled && <span className="feedback-sla-settled">（已办结）</span>}
          </span>
        );
      }
    },
    submittedAt: {
      title: "提交时间",
      dataIndex: "submittedAt",
      key: "submittedAt",
      width: 155,
      sorter: (a, b) => a.submittedAt.localeCompare(b.submittedAt)
    }
  };

  const actionColumn: TableColumnsType<FeedbackTicket>[number] = {
    title: "操作",
    key: "action",
    className: "device-ops-col-actions",
    width: 140,
    fixed: "right",
    render: (_: unknown, record: FeedbackTicket) => {
      const actions = [];

      // 查看
      actions.push(
        <Button
          key="view"
          type="link"
          size="small"
          onClick={() => setCurrentTicketId(record.id)}
        >
          查看
        </Button>
      );

      // 单行状态主推动作
      if (record.status === "pending") {
        actions.push(
          guard(
            "platform:feedback:receive",
            <Button
              key="receive"
              type="link"
              size="small"
              disabled={readonly}
              onClick={() => handleReceive(record.id)}
            >
              受理
            </Button>
          )
        );
      } else if (record.status === "processing") {
        actions.push(
          guard(
            "platform:feedback:reply",
            <Button
              key="reply"
              type="link"
              size="small"
              disabled={readonly}
              onClick={() => handleOpenReply(record)}
            >
              回复用户
            </Button>
          )
        );
      } else if (record.status === "awaiting_user") {
        actions.push(
          guard(
            "platform:feedback:resolve",
            <Popconfirm
              key="resolve"
              title="确认标记为已解决？"
              description="此后不可再回复用户，仅剩关闭"
              disabled={readonly}
              okText="确认"
              cancelText="取消"
              onConfirm={() => handleResolve(record.id)}
            >
              <Button type="link" size="small" disabled={readonly}>
                标记已解决
              </Button>
            </Popconfirm>
          )
        );
      } else if (record.status === "resolved") {
        actions.push(
          guard(
            "platform:feedback:close",
            <Button
              key="close"
              type="link"
              size="small"
              disabled={readonly}
              onClick={() => handleOpenCloseModal(record)}
            >
              关闭
            </Button>
          )
        );
      }

      return <Space size={0}>{actions}</Space>;
    }
  };

  const tableColumns = useMemo(() => {
    const list: TableColumnsType<FeedbackTicket> = [];
    ALL_COLUMN_KEYS.forEach((key) => {
      if (visibleColumnKeys.includes(key) && allColumns[key]) list.push(allColumns[key]);
    });
    list.push(actionColumn);
    return list;
  }, [visibleColumnKeys, readonly]);

  // 403 兜底
  if (isForbidden) {
    return (
      <div className="device-ops-stack">
        <header className="device-ops-title-row">
          <h1 className="device-ops-title">客户反馈</h1>
        </header>
        <section className="device-ops-panel">
          <Empty
            description={
              <div>
                <Typography.Title level={4}>403 无访问权限</Typography.Title>
                <Typography.Text type="secondary">
                  当前账号未开通「客户反馈（platform:feedback:view）」权限，如需使用请联系管理员开通。
                </Typography.Text>
              </div>
            }
          >
            <Button type="primary" onClick={() => message.success("权限申请已提交，请等待管理员审批")}>
              申请权限
            </Button>
          </Empty>
        </section>
      </div>
    );
  }

  // 空态渲染
  const renderEmptyState = () => {
    if (dataState === "empty" || feedbackTickets.length === 0) {
      // 空态主按钮口径（页 9 验收 6）：无 create 权限不显示按钮，不收为置灰态。
      return (
        <Empty
          description={
            <span>
              暂无客户反馈工单，点右上角『客服代录工单』新建，或等待 App 端用户提交
            </span>
          }
        >
          {!readonly && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
              客服代录工单
            </Button>
          )}
        </Empty>
      );
    }
    return (
      <Empty description="没有符合条件的工单，请调整筛选条件后重新查询">
        <Button onClick={handleReset}>重置筛选</Button>
      </Empty>
    );
  };

  return (
    <div className="device-ops-page feedback-page">
      {/* 顶部标题与全局操作 */}
      <header className="device-ops-title-row">
        <Space align="center" size="middle">
          {fromUrl && !currentTicket && (
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(fromUrl)}
            >
              返回来源
            </Button>
          )}
          <h1 className="device-ops-title">客户反馈</h1>
        </Space>
        <Space orientation="horizontal" size="small">
          {guard(
            "platform:feedback:create",
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={readonly}
              onClick={() => setCreateModalOpen(true)}
            >
              客服代录工单
            </Button>
          )}
        </Space>
      </header>

      {/* SLA 已超时预警横幅 */}
      {appliedFilters.slaState === "overdue" && (
        <Alert
          className="feedback-overdue-banner"
          showIcon
          title={`存在 ${overdueCount} 条已超时工单，请优先安排受理与回复`}
          type="warning"
        />
      )}

      {/* 状态 Tab */}
      <Tabs
        activeKey={activeTabKey}
        items={STATUS_TABS.map((tab) => ({
          key: tab.key,
          label: `${tab.label} (${tabCounts[tab.key] ?? 0})`
        }))}
        onChange={handleTabChange}
      />

      {/* 筛选区（5 常驻 + 5 收纳）；aria-label 供结构合同筛选区栅格锚定，不改变视觉与交互 */}
      <section className="feedback-filter-panel" aria-label="筛选">
        {/* 常驻 5 项 */}
        <div className="feedback-filter-row">
          <div className="feedback-filter-item">
            <label>反馈编号</label>
            <Input
              allowClear
              placeholder="输入完整反馈编号"
              value={filters.ticketId}
              onChange={(e) => setFilters({ ...filters, ticketId: e.target.value })}
            />
          </div>

          <div className={`feedback-filter-item ${isTicketIdSearchActive ? "feedback-filter-item--disabled" : ""}`}>
            <label>SLA 状态</label>
            <Select
              disabled={isTicketIdSearchActive}
              options={SLA_STATE_OPTIONS}
              value={filters.slaState}
              onChange={(val) => setFilters({ ...filters, slaState: val })}
            />
          </div>

          <div className={`feedback-filter-item ${isTicketIdSearchActive ? "feedback-filter-item--disabled" : ""}`}>
            <label>优先级</label>
            <Select
              allowClear
              disabled={isTicketIdSearchActive}
              mode="multiple"
              options={PRIORITY_OPTIONS}
              placeholder="全选 / 任意"
              value={filters.priorities}
              onChange={(val) => setFilters({ ...filters, priorities: val })}
            />
          </div>

          <div className={`feedback-filter-item ${isTicketIdSearchActive ? "feedback-filter-item--disabled" : ""}`}>
            <label>类型</label>
            <Select
              allowClear
              disabled={isTicketIdSearchActive}
              mode="multiple"
              options={TYPE_OPTIONS}
              placeholder="全选 / 任意"
              value={filters.types}
              onChange={(val) => setFilters({ ...filters, types: val })}
            />
          </div>

          <div className={`feedback-filter-item ${isTicketIdSearchActive ? "feedback-filter-item--disabled" : ""}`}>
            <label>提交时间</label>
            <DatePicker.RangePicker
              allowClear
              disabled={isTicketIdSearchActive}
              format="YYYY-MM-DD"
              value={
                filters.submittedRange
                  ? [dayjs(filters.submittedRange[0]), dayjs(filters.submittedRange[1])]
                  : null
              }
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setFilters({
                    ...filters,
                    submittedRange: [dates[0].format("YYYY-MM-DD 00:00"), dates[1].format("YYYY-MM-DD 23:59")]
                  });
                } else {
                  setFilters({ ...filters, submittedRange: null });
                }
              }}
            />
          </div>
        </div>

        {/* 收纳 5 项 */}
        {showMoreFilters && (
          <div className="feedback-filter-row">
            <div className={`feedback-filter-item ${isTicketIdSearchActive ? "feedback-filter-item--disabled" : ""}`}>
              <label>状态</label>
              <Select
                allowClear
                disabled={isTicketIdSearchActive}
                mode="multiple"
                options={STATUS_TABS.filter((t) => t.key !== "all").map((t) => ({ label: t.label, value: t.key }))}
                placeholder="全部状态"
                value={filters.statuses}
                onChange={(val) => setFilters({ ...filters, statuses: val })}
              />
            </div>

            <div className={`feedback-filter-item ${isTicketIdSearchActive ? "feedback-filter-item--disabled" : ""}`}>
              <label>关联 SN</label>
              <Input
                allowClear
                disabled={isTicketIdSearchActive}
                placeholder="支持 TS 开头 SN"
                value={filters.sn}
                onChange={(e) => setFilters({ ...filters, sn: e.target.value })}
              />
            </div>

            <div className={`feedback-filter-item ${isTicketIdSearchActive ? "feedback-filter-item--disabled" : ""}`}>
              <label>App 版本</label>
              <Select
                allowClear
                disabled={isTicketIdSearchActive}
                mode="multiple"
                options={appVersionOptions}
                placeholder="全选"
                value={filters.appVersions}
                onChange={(val) => setFilters({ ...filters, appVersions: val })}
              />
            </div>

            <div className={`feedback-filter-item ${isTicketIdSearchActive ? "feedback-filter-item--disabled" : ""}`}>
              <label>固件版本</label>
              <Select
                allowClear
                disabled={isTicketIdSearchActive}
                mode="multiple"
                options={firmwareVersions.map((v) => ({ label: v, value: v }))}
                placeholder="全选"
                value={filters.firmwares}
                onChange={(val) => setFilters({ ...filters, firmwares: val })}
              />
            </div>

            <div className={`feedback-filter-item ${isTicketIdSearchActive ? "feedback-filter-item--disabled" : ""}`}>
              <label>处理人</label>
              <Input
                allowClear
                disabled={isTicketIdSearchActive}
                placeholder="按处理人模糊搜索"
                value={filters.assignee}
                onChange={(e) => setFilters({ ...filters, assignee: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* 筛选按钮操作 */}
        <div className="feedback-filter-actions">
          <Button
            icon={showMoreFilters ? <UpOutlined /> : <DownOutlined />}
            type="link"
            onClick={() => setShowMoreFilters(!showMoreFilters)}
          >
            {showMoreFilters ? "收起更多筛选" : "更多筛选"}
            {!showMoreFilters && activeMoreFiltersCount > 0 && ` (${activeMoreFiltersCount})`}
          </Button>
          <Button onClick={handleReset} type="text">重置</Button>
          <Button type="primary" onClick={handleSearch}>
            查询
          </Button>
        </div>
      </section>

      {/* 工单表格区 */}
      <section className="device-ops-panel device-ops-panel--table">
        <div className="device-ops-toolbar">
          <span className="device-ops-toolbar__count">
            共 <strong className="device-ops-num">{dataState === "loading" || dataState === "error" ? DASH : filteredTickets.length}</strong> 条工单
            {selectedRowKeys.length > 0 && <>，已选 <strong className="device-ops-num">{selectedRowKeys.length}</strong> 项</>}
          </span>
          <Space>
            <Button aria-label="刷新" icon={<ReloadOutlined aria-hidden="true" aria-label={undefined} />} onClick={handleRefresh} type="text" />
            {guard(
              "platform:feedback:export",
              <Button disabled={readonly} icon={<DownloadOutlined aria-hidden="true" aria-label={undefined} />} onClick={handleExport}>
                导出
              </Button>
            )}
            <Popover
              content={
                <Checkbox.Group
                  className="device-ops-column-setting"
                  onChange={(checked) => {
                    const checkedSet = new Set(checked.map(String));
                    const next = ALL_COLUMN_KEYS.filter((key) => checkedSet.has(key) || FIXED_COLUMN_KEYS.includes(key));
                    setVisibleColumnKeys(next);
                    try {
                      localStorage.setItem(FEEDBACK_STORAGE_KEYS.columns, JSON.stringify(next));
                    } catch {
                      // 忽略
                    }
                  }}
                  options={COLUMN_GROUP_OPTIONS}
                  value={visibleColumnKeys}
                />
              }
              placement="bottomRight"
              trigger="click"
            >
              <Button icon={<SettingOutlined aria-hidden="true" aria-label={undefined} />}>列设置</Button>
            </Popover>
          </Space>
        </div>

        {dataState === "error" ? (
          <Alert
            action={<Button size="small" onClick={handleRefresh}>重试</Button>}
            description="网络异常或服务暂时不可用，请稍后重试。"
            showIcon
            title="客户反馈工单列表加载失败"
            type="error"
          />
        ) : dataState === "loading" ? (
          <Skeleton active paragraph={{ rows: 10 }} title={false} />
        ) : (
          <>
            <Table<FeedbackTicket>
              columns={tableColumns}
              dataSource={dataState === "empty" ? [] : filteredTickets}
              locale={{ emptyText: renderEmptyState() }}
              pagination={{
                pageSize: 20,
                pageSizeOptions: [20, 50, 100],
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`
              }}
              rowClassName={(record) =>
                isFeedbackOpen(record) && slaStateOf(record) === "overdue" ? "feedback-row--overdue" : ""
              }
              rowKey="id"
              rowSelection={{
                columnWidth: 48,
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys as string[]),
                getCheckboxProps: (record) => ({
                  disabled: record.status !== "pending" && record.status !== "processing"
                })
              }}
              scroll={{ x: 1200 }}
            />

          </>
        )}
      </section>

      {/* 批量操作条：与其他三页同一底部吸附共用类 */}
      {selectedRowKeys.length > 0 && (
        <div aria-label="批量操作" className="device-ops-selection-bar" role="region">
          <span>已选 <strong className="device-ops-num">{selectedRowKeys.length}</strong> 项（仅待受理 / 处理中工单可指派）</span>
          <Space>
            {guard(
              "platform:feedback:assign",
              <Button
                type="primary"
                disabled={readonly}
                onClick={() => handleOpenAssign(selectedRowKeys)}
              >
                批量指派
              </Button>
            )}
            <Button onClick={() => setSelectedRowKeys([])}>取消选择</Button>
          </Space>
        </div>
      )}

      {/* 反馈详情 Drawer 720px */}
      <Drawer
        extra={
          fromUrl && (
            <Button
              icon={<ArrowLeftOutlined />}
              size="small"
              onClick={() => navigate(fromUrl)}
            >
              返回来源
            </Button>
          )
        }
        footer={
          currentTicket && (
            <div className="feedback-drawer-footer">
              <span className="device-ops-muted feedback-muted-sm">
                {!isFeedbackOpen(currentTicket) && "当前工单处于终态，不可再变更"}
              </span>
              <div className="feedback-drawer-footer__right">
                {currentTicket.status === "pending" && (
                  <>
                    {guard(
                      "platform:feedback:reject",
                      <Button
                        danger
                        disabled={readonly}
                        type="text"
                        onClick={() => handleOpenReject(currentTicket)}
                      >
                        驳回
                      </Button>
                    )}
                    {guard(
                      "platform:feedback:rma",
                      <Button
                        disabled={readonly}
                        onClick={() => handleGoRma(currentTicket)}
                      >
                        转退货 RMA
                      </Button>
                    )}
                    {guard(
                      "platform:feedback:assign",
                      <Button
                        disabled={readonly}
                        onClick={() => handleOpenAssign([currentTicket.id])}
                      >
                        指派
                      </Button>
                    )}
                    {guard(
                      "platform:feedback:receive",
                      <Button
                        disabled={readonly}
                        type="primary"
                        onClick={() => handleReceive(currentTicket.id)}
                      >
                        受理
                      </Button>
                    )}
                  </>
                )}

                {currentTicket.status === "processing" && (
                  <>
                    {guard(
                      "platform:feedback:reject",
                      <Button
                        danger
                        disabled={readonly}
                        type="text"
                        onClick={() => handleOpenReject(currentTicket)}
                      >
                        驳回
                      </Button>
                    )}
                    {guard(
                      "platform:feedback:rma",
                      <Button
                        disabled={readonly}
                        onClick={() => handleGoRma(currentTicket)}
                      >
                        转退货 RMA
                      </Button>
                    )}
                    {guard(
                      "platform:feedback:resolve",
                      <Popconfirm
                        description="此后不可再回复用户，仅剩关闭"
                        disabled={readonly}
                        okText="确认"
                        title="确认标记已解决？"
                        onConfirm={() => handleResolve(currentTicket.id)}
                      >
                        <Button disabled={readonly}>标记已解决</Button>
                      </Popconfirm>
                    )}
                    {guard(
                      "platform:feedback:assign",
                      <Button
                        disabled={readonly}
                        onClick={() => handleOpenAssign([currentTicket.id])}
                      >
                        指派
                      </Button>
                    )}
                    {guard(
                      "platform:feedback:reply",
                      <Button
                        disabled={readonly}
                        type="primary"
                        onClick={() => handleOpenReply(currentTicket)}
                      >
                        回复用户
                      </Button>
                    )}
                  </>
                )}

                {currentTicket.status === "awaiting_user" && (
                  <>
                    {guard(
                      "platform:feedback:rma",
                      <Button
                        disabled={readonly}
                        onClick={() => handleGoRma(currentTicket)}
                      >
                        转退货 RMA
                      </Button>
                    )}
                    {guard(
                      "platform:feedback:resolve",
                      <Popconfirm
                        description="此后不可再回复用户，仅剩关闭"
                        disabled={readonly}
                        okText="确认"
                        title="确认标记已解决？"
                        onConfirm={() => handleResolve(currentTicket.id)}
                      >
                        <Button disabled={readonly}>标记已解决</Button>
                      </Popconfirm>
                    )}
                    {guard(
                      "platform:feedback:reply",
                      <Button
                        disabled={readonly}
                        type="primary"
                        onClick={() => handleOpenReply(currentTicket)}
                      >
                        回复用户
                      </Button>
                    )}
                  </>
                )}

                {currentTicket.status === "resolved" && (
                  guard(
                    "platform:feedback:close",
                    <Button
                      disabled={readonly}
                      type="primary"
                      onClick={() => handleOpenCloseModal(currentTicket)}
                    >
                      关闭工单
                    </Button>
                  )
                )}
              </div>
            </div>
          )
        }
        open={Boolean(currentTicket)}
        title={
          currentTicket && (
            <Space align="center" size="middle">
              <span>反馈详情 · {currentTicket.id}</span>
              <FeedbackStatusTag value={currentTicket.status} />
              <FeedbackTypeTag value={currentTicket.type} />
              <span className={`feedback-priority feedback-priority--${currentTicket.priority.toLowerCase()}`}>
                {currentTicket.priority}
              </span>
            </Space>
          )
        }
        size={720}
        onClose={() => setCurrentTicketId(null)}
      >
        {currentTicket && (
          <div className="feedback-drawer-body">
            {/* 基础信息区 */}
            <div>
              <div className="feedback-section-title">基础信息</div>
              <div className="feedback-grid-3">
                <div className="feedback-field">
                  <span className="feedback-field__label">用户 ID</span>
                  <span className="feedback-field__value">{currentTicket.userId || DASH}</span>
                </div>
                <div className="feedback-field">
                  <span className="feedback-field__label">联系方式</span>
                  <span className="feedback-field__value">{currentTicket.contact ? maskPhone(currentTicket.contact) : DASH}</span>
                </div>
                <div className="feedback-field">
                  <span className="feedback-field__label">关联设备 SN</span>
                  <span className="feedback-field__value">
                    {currentTicket.sn ? (
                      <a href={`${appPath(`/devices/${currentTicket.sn}`)}?from=${encodeURIComponent(returnUrl)}`}>{currentTicket.sn}</a>
                    ) : (
                      DASH
                    )}
                  </span>
                </div>
                <div className="feedback-field">
                  <span className="feedback-field__label">App 版本</span>
                  <span className="feedback-field__value">{currentTicket.appVersion || DASH}</span>
                </div>
                <div className="feedback-field">
                  <span className="feedback-field__label">固件版本</span>
                  <span className="feedback-field__value">{currentTicket.firmware || DASH}</span>
                </div>
                <div className="feedback-field">
                  <span className="feedback-field__label">工单来源</span>
                  <span className="feedback-field__value">
                    {currentTicket.source === "agent" ? "客服代录" : "App 用户端"}
                  </span>
                </div>
                <div className="feedback-field">
                  <span className="feedback-field__label">提交时间</span>
                  <span className="feedback-field__value">{currentTicket.submittedAt}</span>
                </div>
                <div className="feedback-field">
                  <span className="feedback-field__label">当前处理人</span>
                  <span className="feedback-field__value">{currentTicket.assignee || "待指派"}</span>
                </div>
              </div>

              {/* 跨页关联线索 */}
              {(currentTicket.relatedAlertId || currentTicket.rmaId) && (
                <div className="feedback-grid-2 feedback-related-box">
                  {currentTicket.relatedAlertId && (
                    <div className="feedback-field">
                      <span className="feedback-field__label">关联告警（点击直达告警处置）</span>
                      <span className="feedback-field__value">
                        <a href={appPath(`/alerts?alert=${currentTicket.relatedAlertId}`)}>
                          告警编号：{currentTicket.relatedAlertId}
                        </a>
                      </span>
                    </div>
                  )}
                  {currentTicket.rmaId && (
                    <div className="feedback-field">
                      <span className="feedback-field__label">关联退货 RMA（点击直达 RMA 详情）</span>
                      <span className="feedback-field__value">
                        <a href={appPath(`/exceptions/rma?rma=${currentTicket.rmaId}`)}>
                          RMA 单号：{currentTicket.rmaId}
                        </a>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* 反馈内容 */}
              <div className="feedback-block">
                <div className="feedback-field__label feedback-block__label">反馈描述内容</div>
                <div className="feedback-content-box">{currentTicket.content}</div>
              </div>

              {/* 附件 */}
              <div className="feedback-block feedback-block--tight">
                <div className="feedback-field__label">附件列表 ({currentTicket.attachments.length})</div>
                {currentTicket.attachments.length === 0 ? (
                  <span className="device-ops-muted feedback-muted-sm">无附件</span>
                ) : (
                  <div className="feedback-attachment-list">
                    {currentTicket.attachments.map((att, idx) => (
                      <div key={idx} className="feedback-attachment-item">
                        <PaperClipOutlined />
                        <span>{att.name}</span>
                        <span className="device-ops-muted">({Math.round(att.sizeBytes / 1024)} KB)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* SLA 履约区 */}
            <div>
              <div className="feedback-section-title">SLA 履约信息</div>
              <div className="feedback-grid-3">
                <div className="feedback-field">
                  <span className="feedback-field__label">SLA 承诺时限</span>
                  <span className="feedback-field__value">{currentTicket.slaTargetHours} 小时</span>
                </div>
                <div className="feedback-field">
                  <span className="feedback-field__label">截止时间</span>
                  <span className="feedback-field__value">{currentTicket.slaDeadlineAt}</span>
                </div>
                <div className="feedback-field">
                  <span className="feedback-field__label">剩余时效</span>
                  <span className="feedback-field__value">
                    <span className={`feedback-sla-time feedback-sla-time--${slaStateOf(currentTicket)}`}>
                      {slaRemainingLabel(currentTicket)}
                      {!isFeedbackOpen(currentTicket) && <span className="feedback-sla-settled">（计时停止）</span>}
                    </span>
                  </span>
                </div>
                <div className="feedback-field">
                  <span className="feedback-field__label">受理人</span>
                  <span className="feedback-field__value">{currentTicket.acceptedBy || "尚未受理"}</span>
                </div>
                <div className="feedback-field">
                  <span className="feedback-field__label">受理时间</span>
                  <span className="feedback-field__value">{currentTicket.acceptedAt || DASH}</span>
                </div>
                <div className="feedback-field">
                  <span className="feedback-field__label">办结归档时间</span>
                  <span className="feedback-field__value">{currentTicket.resolvedAt || DASH}</span>
                </div>
              </div>
            </div>

            {/* 回复历史 Timeline */}
            <div>
              <div className="feedback-section-title">回复历史 ({currentTicket.replies.length})</div>
              {currentTicket.replies.length === 0 ? (
                <span className="device-ops-muted feedback-muted-sm">暂无回复记录</span>
              ) : (
                <Timeline
                  items={currentTicket.replies.map((reply: FeedbackReply, idx: number) => ({
                    color: reply.from === "staff" ? "blue" : "green",
                    content: (
                      <div key={idx} className="feedback-timeline-content">
                        <div className="feedback-timeline-meta">
                          <Space size={6}>
                            <UserOutlined />
                            <strong>{reply.from === "staff" ? "客服回复" : "用户留言"}</strong>
                          </Space>
                          <span>{reply.at}</span>
                          {reply.pushStatus === "pushed" && <Tag color="success">已推送 App</Tag>}
                          {reply.pushStatus === "not_required" && <Tag>无需推送</Tag>}
                        </div>
                        <div className="feedback-timeline-text">{reply.content}</div>
                      </div>
                    )
                  }))}
                />
              )}
            </div>

            {/* 流转记录 Timeline */}
            <div>
              <div className="feedback-section-title">流转记录 ({currentTicket.flow.length})</div>
              <Timeline
                items={currentTicket.flow.map((entry: FeedbackFlowEntry, idx: number) => {
                  const fromLabel = entry.from ? feedbackStatusMeta[entry.from]?.label : "初始创建";
                  const toLabel = feedbackStatusMeta[entry.to]?.label;
                  return {
                    color: entry.to === "rejected" ? "red" : entry.to === "resolved" || entry.to === "closed" ? "gray" : "blue",
                    content: (
                      <div key={idx} className="feedback-timeline-content">
                        <div className="feedback-timeline-meta">
                          <span>{entry.at}</span>
                          <strong>{entry.operator}</strong>
                          <span>{fromLabel} → {toLabel}</span>
                        </div>
                        {entry.note && (
                          <div className="device-ops-muted feedback-flow-note">
                            备注：{entry.note}
                          </div>
                        )}
                      </div>
                    )
                  };
                })}
              />
              {currentTicket.rejectReason && (
                <Alert
                  className="feedback-reject-alert"
                  description={currentTicket.rejectReason}
                  title="驳回原因说明"
                  type="error"
                />
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* 回复用户 Drawer 480px 叠层 */}
      <Drawer
        footer={
          <div className="feedback-dialog-footer">
            <Button onClick={() => setReplyDrawerOpen(false)}>取消</Button>
            <Popconfirm
              description="发送后不可撤回，将推送到用户 App 消息"
              okText="确认发送"
              title="确认发送回复？"
              onConfirm={handleConfirmReply}
            >
              <Button type="primary">发送回复</Button>
            </Popconfirm>
          </div>
        }
        open={replyDrawerOpen}
        size={480}
        title={currentTicket ? `回复工单 · ${currentTicket.id}` : "回复用户"}
        onClose={() => setReplyDrawerOpen(false)}
      >
        <Form form={replyForm} layout="vertical">
          <Form.Item
            label="回复内容"
            name="content"
            rules={[
              { required: true, message: "请输入回复内容" },
              { max: 500, message: "回复内容不得超过 500 字" }
            ]}
          >
            <Input.TextArea
              placeholder="请输入答复用户的具体说明，将通过 App 消息推送到用户客户端..."
              rows={6}
              showCount
            />
          </Form.Item>
          <Form.Item name="markAwaiting" valuePropName="checked">
            <Checkbox>同时标记工单状态为「待用户确认」</Checkbox>
          </Form.Item>
        </Form>
      </Drawer>

      {/* 指派 Modal 420px */}
      <Modal
        okText="确认指派"
        open={assignModalOpen}
        title={assignTargetIds.length > 1 ? `批量指派 (${assignTargetIds.length} 条)` : "工单指派"}
        width={420}
        onCancel={() => setAssignModalOpen(false)}
        onOk={handleConfirmAssign}
      >
        <div className="feedback-assign-body">
          <div>
            已选择 <strong>{assignTargetIds.length}</strong> 条工单，请选择指派的处理人：
          </div>
          <Select
            className="feedback-select-full"
            options={staffOptions}
            placeholder="请选择处理人"
            value={assigneeSelect}
            onChange={(val) => setAssigneeSelect(val)}
          />
        </div>
      </Modal>

      {/* 驳回 Modal 480px */}
      <Modal
        okButtonProps={{ danger: true }}
        okText="确认驳回"
        open={rejectModalOpen}
        title="驳回工单（终态操作）"
        width={480}
        onCancel={() => setRejectModalOpen(false)}
        onOk={handleConfirmReject}
      >
        <Form className="feedback-modal-form" form={rejectForm} layout="vertical">
          <Alert
            className="feedback-modal-alert"
            showIcon
            title="驳回为终态流转，驳回后工单将进入已驳回状态不可再变更，驳回原因将推送给用户。"
            type="warning"
          />
          <Form.Item
            label="驳回原因"
            name="reason"
            rules={[
              { required: true, message: "驳回原因必填" },
              { min: 5, message: "驳回原因至少 5 个字" },
              { max: 200, message: "驳回原因不得超过 200 字" }
            ]}
          >
            <Input.TextArea
              placeholder="请输入 5–200 字的详细驳回原因说明..."
              rows={4}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 关闭工单 Modal（C 档强确认） */}
      <Modal
        okText="确认关闭"
        open={closeModalOpen}
        title="关闭工单确认"
        width={480}
        onCancel={() => {
          setCloseModalOpen(false);
          setTicketToClose(null);
        }}
        onOk={handleConfirmClose}
      >
        {ticketToClose && (
          <div className="feedback-modal-body">
            <p>
              确定要关闭工单 <strong>{ticketToClose.id}</strong> 吗？
            </p>
            <p className="device-ops-muted">
              关闭后工单将进入已关闭终态，无法再继续受理、回复或变更流转。
            </p>
          </div>
        )}
      </Modal>

      {/* 客服代录工单 Modal 640px */}
      <Modal
        okText="提交工单"
        open={createModalOpen}
        title="客服代录工单"
        width={640}
        onCancel={() => {
          setCreateModalOpen(false);
          createForm.resetFields();
        }}
        onOk={handleCreateManual}
      >
        <Form
          className="feedback-modal-form"
          form={createForm}
          initialValues={{ type: "fault", priority: "P2" }}
          layout="vertical"
        >
          <div className="feedback-form-grid">
            <Form.Item
              label="工单类型"
              name="type"
              rules={[{ required: true, message: "请选择类型" }]}
            >
              <Select options={TYPE_OPTIONS} />
            </Form.Item>

            <Form.Item
              label="优先级"
              name="priority"
              rules={[{ required: true, message: "请选择优先级" }]}
            >
              <Select options={PRIORITY_OPTIONS} />
            </Form.Item>
          </div>

          <Form.Item
            label="反馈内容"
            name="content"
            rules={[
              { required: true, message: "请输入反馈内容" },
              { max: 500, message: "内容不得超过 500 字" }
            ]}
          >
            <Input.TextArea
              placeholder="请详细描述客户反馈的问题、诉求或现场情况..."
              rows={4}
              showCount
            />
          </Form.Item>

          <div className="feedback-form-grid">
            <Form.Item
              label="关联设备 SN（选填）"
              name="sn"
              rules={[
                {
                  validator: async (_, value) => {
                    if (!value) return;
                    const exists = devices.some((d) => d.sn === value.trim());
                    if (!exists) throw new Error("系统内未找到该 SN 对应的设备");
                  }
                }
              ]}
            >
              <Input placeholder="例如 TS24070001" />
            </Form.Item>

            <Form.Item label="用户 ID（选填）" name="userId">
              <Input placeholder="例如 U100014" />
            </Form.Item>
          </div>

          <div className="feedback-form-grid">
            <Form.Item label="联系电话（选填）" name="contact">
              <Input placeholder="例如 13800008000" />
            </Form.Item>

            <Form.Item label="App 版本（选填）" name="appVersion">
              <Input placeholder="例如 3.2.4" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

    </div>
  );
}
