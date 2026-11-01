import { useMemo, useState, type ReactNode } from "react";
import { Alert, App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Skeleton, Space, Tabs } from "antd";
import {
  alertStatusMeta,
  alertTypeLabel,
  resolutionConclusions,
  staffOptions,
  type AlertLevel,
  type AlertRecord,
  type AlertStatus,
  type AlertType,
  type NextStep,
  type ResolutionConclusion
} from "../data";
import { deviceOpsStore, useDeviceOpsState, type ActionResult } from "../store";
import { AlertLevelText, AlertStatusTag, appPath, useDataState, usePermission, useQueryParams, useRouter } from "../ui";
import {
  affectedLabel,
  affectedTarget,
  alertLevels,
  alertStatusOrder,
  alertStepActionEnabled,
  alertTabCounts,
  alertsReturnSearch,
  filterAlerts,
  isAlertLevel,
  isAlertStatus,
  isAlertType,
  isTerminalAlert,
  listAlertsForTab,
  nextAlertSelectionId,
  pickSelectedAlert,
  ticketFormPayload,
  ticketPrefillFor,
  ticketPriorityOptions,
  ticketTypeOptions
} from "../core/alerts";

const ticketTypes = ticketTypeOptions.map((value) => ({ value, label: value }));
const priorityOptions = ticketPriorityOptions.map((value) => ({ value, label: value }));
const typeOptions = (Object.keys(alertTypeLabel) as AlertType[]).map((value) => ({ value, label: alertTypeLabel[value] }));
const levelOptions = alertLevels.map((value) => ({ value, label: value }));
const conclusionOptions = resolutionConclusions.map((value) => ({ value, label: value }));

type ResolveValues = { conclusion?: ResolutionConclusion; note?: string };

export function AlertsPage() {
  const { message } = App.useApp();
  const { navigate, search } = useRouter();
  const params = useQueryParams();
  const dataState = useDataState();
  const { readonly, guard } = usePermission();
  const { alerts, alertRules } = useDeviceOpsState();

  const [typeFilter, setTypeFilter] = useState<AlertType | undefined>(() => {
    const value = params.get("type");
    return isAlertType(value) ? value : undefined;
  });
  const [levelFilter, setLevelFilter] = useState<AlertLevel | undefined>(() => {
    const value = params.get("level");
    return isAlertLevel(value) ? value : undefined;
  });
  const [keyword, setKeyword] = useState(params.get("sn") ?? "");
  const [tab, setTab] = useState<AlertStatus>(() => {
    // 2026-09-29 批 1：支持 ?status=<分栏>（工作台卡片预置筛选）与 ?alert=<id>（浮层单条直达选中）。
    const viaStatus = params.get("status") ?? params.get("tab");
    if (isAlertStatus(viaStatus)) return viaStatus;
    const alertId = params.get("alert");
    if (alertId) {
      const hit = deviceOpsStore.getState().alerts.find((alert) => alert.id === alertId);
      if (hit) return hit.status;
    }
    const sn = params.get("sn");
    if (!sn) return "open";
    // 从设备页带着 SN 过来时，直接落到有结果的分栏。
    return alertStatusOrder.find((status) => deviceOpsStore.getState().alerts.some((alert) => alert.status === status && alert.sns.includes(sn))) ?? "open";
  });
  const [selectedId, setSelectedId] = useState<string | null>(params.get("alert") ?? params.get("id"));
  const [ticketOpen, setTicketOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [assignee, setAssignee] = useState<string | undefined>();
  const [ticketForm] = Form.useForm<{ target: string; type: string; priority: string; assignee: string; description: string }>();
  const [resolveForm] = Form.useForm<ResolveValues>();
  const conclusionValue = Form.useWatch("conclusion", resolveForm);

  const filtered = useMemo(
    () => filterAlerts(alerts, { type: typeFilter, level: levelFilter, keyword }),
    [alerts, typeFilter, levelFilter, keyword]
  );

  const counts = useMemo(() => alertTabCounts(filtered), [filtered]);

  const list = listAlertsForTab(filtered, tab);
  const selected = pickSelectedAlert(list, selectedId);
  const terminal = selected ? isTerminalAlert(selected) : false;

  // 进入设备详情前记下当前分栏、选中项与筛选，详情页的“返回”据此回到原处。
  const returnUrl = `${appPath("/alerts")}?${alertsReturnSearch({ tab, selectedId: selected?.id ?? null, keyword, type: typeFilter, level: levelFilter })}`;
  const deviceHref = (sn: string) => appPath(`/devices/${sn}?from=${encodeURIComponent(returnUrl)}`);
  const ruleById = (id: string) => alertRules.find((rule) => rule.id === id);

  // 单台设备直达详情；批次级告警带筛选条件去全部设备。
  const affectedHref = (alert: AlertRecord) => {
    const target = affectedTarget(alert);
    if (target.kind === "device") return deviceHref(target.sn);
    if (target.kind === "devicesBatchOffline") return appPath(`/devices?batch=${target.batch}&online=offline`);
    return appPath("/devices");
  };

  // 处理后留在当前分栏并自动选中下一条；提示里的“查看”再跳到告警新所在的分栏。
  const perform = (alertId: string, act: () => ActionResult, success: string | ((message?: string) => string)) => {
    const result = act();
    if (!result.ok) {
      message.error(`操作失败：${result.reason}，告警状态未变化`);
      return false;
    }
    const successText = typeof success === "function" ? success(result.message) : success;
    const after = deviceOpsStore.getState().alerts.find((alert) => alert.id === alertId);
    const left = Boolean(after && after.status !== tab);
    const key = `alert-${alertId}-${after?.events.length ?? 0}`;
    message.success({
      key,
      duration: 6,
      content: (
        <span>
          {successText}
          {after && left && (
            <Button
              onClick={() => {
                setTab(after.status);
                setSelectedId(alertId);
                message.destroy(key);
              }}
              size="small"
              type="link"
            >
              查看
            </Button>
          )}
        </span>
      )
    });
    if (left) setSelectedId(nextAlertSelectionId(list, alertId));
    return true;
  };

  const ticketInitial = selected ? ticketPrefillFor(selected) : undefined;

  const submitTicket = async () => {
    if (!selected) return;
    const values = await ticketForm.validateFields().catch(() => null);
    if (!values) return;
    const alertId = selected.id;
    // 2026-09-29 批 2：弹窗的类型 / 优先级 / 描述写入 FeedbackTicket 实体（反馈页详情同源展示）。
    const ok = perform(
      alertId,
      () => deviceOpsStore.createTicket(alertId, ticketFormPayload(values, selected.level)),
      (ticketId) => `已创建工单 ${ticketId ?? ""}`.trim()
    );
    if (ok) setTicketOpen(false);
  };

  const submitAssign = () => {
    if (!selected) return;
    if (!assignee) {
      message.warning("请选择处理人");
      return;
    }
    if (perform(selected.id, () => deviceOpsStore.assign(selected.id, assignee), `已指派给 ${assignee}`)) {
      setAssignOpen(false);
      setAssignee(undefined);
    }
  };

  const submitResolve = async () => {
    if (!selected) return;
    const values = await resolveForm.validateFields().catch(() => null);
    if (!values) return;
    const conclusion = values.conclusion as ResolutionConclusion;
    if (perform(selected.id, () => deviceOpsStore.resolve(selected.id, { conclusion, note: values.note ?? "" }), "已标记为已处理")) {
      setResolveOpen(false);
    }
  };

  const tabItems = alertStatusOrder.map((status) => ({
    key: status,
    label: `${alertStatusMeta[status].label}（${counts[status]}）`
  }));

  const retry = () => {
    const next = new URLSearchParams(search);
    next.delete("dataState");
    navigate(`${appPath("/alerts")}${next.size ? `?${next}` : ""}`);
  };

  // “下一步”里每条建议自带能直接做的动作；已结束或已转工单的告警不再给出修改类动作。
  const renderStepAction = (alert: AlertRecord, step: NextStep): ReactNode => {
    if (step.action === "devices") {
      return <Button href={affectedHref(alert)} size="small">{affectedLabel(alert)}</Button>;
    }
    if (step.action === "ticket" && alertStepActionEnabled(alert, "ticket")) {
      return guard("转工单", <Button disabled={readonly} onClick={() => setTicketOpen(true)} size="small">转工单</Button>);
    }
    if (step.action === "resolve" && alertStepActionEnabled(alert, "resolve")) {
      return guard("处理", <Button disabled={readonly} onClick={() => setResolveOpen(true)} size="small">标记已处理</Button>);
    }
    return null;
  };

  return (
    <div className="device-ops-stack">
      <header className="device-ops-title-row">
        <h1 className="device-ops-title">告警处置</h1>
      </header>

      <section aria-label="告警筛选" className="device-ops-panel device-ops-panel--flush">
        <Tabs activeKey={tab} items={tabItems} onChange={(key) => setTab(key as AlertStatus)} />
        <div className="device-ops-alert-filters">
          <Select allowClear onChange={setTypeFilter} options={typeOptions} placeholder="全部类型" value={typeFilter} />
          <Select allowClear onChange={setLevelFilter} options={levelOptions} placeholder="全部级别" value={levelFilter} />
          <Input allowClear aria-label="关键词或 SN" onChange={(event) => setKeyword(event.target.value)} placeholder="搜索标题、对象或 SN" value={keyword} />
        </div>
      </section>

      {dataState === "error" ? (
        <Alert action={<Button onClick={retry} size="small">重试</Button>} description="网络异常或服务暂时不可用，请稍后重试。" showIcon title="告警列表加载失败" type="error" />
      ) : dataState === "loading" ? (
        <div className="device-ops-alert-layout">
          <div className="device-ops-panel"><Skeleton active paragraph={{ rows: 8 }} /></div>
          <div className="device-ops-panel"><Skeleton active paragraph={{ rows: 8 }} /></div>
        </div>
      ) : list.length === 0 || dataState === "empty" ? (
        <div className="device-ops-panel">
          <Empty description={`当前没有${alertStatusMeta[tab].label}的告警`} />
        </div>
      ) : (
        <div className="device-ops-alert-layout">
          <ul aria-label="告警列表" className="device-ops-panel device-ops-alert-list">
            {list.map((alert) => (
              <li key={alert.id}>
                <button
                  aria-current={selected?.id === alert.id}
                  className="device-ops-alert-item"
                  onClick={() => setSelectedId(alert.id)}
                  type="button"
                >
                  <span className="device-ops-alert-item__top">
                    <AlertLevelText level={alert.level} />
                    <span className="device-ops-alert-item__type">{alertTypeLabel[alert.type]}</span>
                  </span>
                  <span className="device-ops-alert-item__title">{alert.title}</span>
                  <span className="device-ops-alert-item__meta">
                    {alert.target} · 首次发现 <span className="device-ops-num">{alert.firstSeenAt}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected && (
            <article aria-label="告警详情" className="device-ops-panel device-ops-alert-detail">
              <header className="device-ops-alert-detail__head">
                <div>
                  <div className="device-ops-alert-detail__tags">
                    <AlertStatusTag value={selected.status} />
                    <AlertLevelText level={selected.level} />
                    <span className="device-ops-muted">{alertTypeLabel[selected.type]}</span>
                  </div>
                  <h2 className="device-ops-alert-detail__title">{selected.title}</h2>
                  <dl className="device-ops-meta">
                    <div>
                      <dt>告警对象</dt>
                      <dd>
                        {selected.sns.length === 1 ? (
                          <a href={deviceHref(selected.sns[0])}>{selected.target}</a>
                        ) : selected.pushTaskId ? (
                          // 2026-09-29 批 1 动线 3：升级失败类告警对象链接到推送任务详情（Tab 二）。
                          <a href={`${appPath("/system/firmware")}?tab=push-task&task=${encodeURIComponent(selected.pushTaskId)}`}>{selected.target}</a>
                        ) : (
                          selected.target
                        )}
                      </dd>
                    </div>
                    <div><dt>首次发现</dt><dd className="device-ops-num">{selected.firstSeenAt}</dd></div>
                    <div><dt>最近发现</dt><dd className="device-ops-num">{selected.lastSeenAt}</dd></div>
                    <div><dt>处理人</dt><dd>{selected.assignee ?? "未指派"}</dd></div>
                    {/* 2026-09-29 批 2：告警由规则触发；设备自检告警无关联规则，显示纯文本。 */}
                    <div>
                      <dt>触发规则</dt>
                      <dd>
                        {selected.ruleId ? (
                          <a href={`${appPath("/system/alert-rules")}?rule=${encodeURIComponent(selected.ruleId)}&from=${encodeURIComponent(returnUrl)}`}>
                            {ruleById(selected.ruleId)?.name ?? selected.ruleId}
                          </a>
                        ) : (
                          <span className="device-ops-muted">设备自检发现，无关联规则</span>
                        )}
                      </dd>
                    </div>
                    {selected.ticketId && (
                      <div>
                        <dt>关联工单</dt>
                        <dd>
                          {/* 2026-09-29 批 2：工单号解锁为链接，到客户反馈直接打开对应工单并支持返回本页。 */}
                          <a href={`${appPath("/exceptions/feedback")}?ticket=${encodeURIComponent(selected.ticketId)}&from=${encodeURIComponent(returnUrl)}`}>
                            {selected.ticketId}
                          </a>
                        </dd>
                      </div>
                    )}
                    {selected.mutedUntil && <div><dt>静默至</dt><dd className="device-ops-num">{selected.mutedUntil}</dd></div>}
                    {selected.resolution && (
                      <div>
                        <dt>处理结论</dt>
                        <dd>
                          {selected.resolution.conclusion}
                          {selected.resolution.note ? `（${selected.resolution.note}）` : ""}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
                {/* 主次：转工单为主，指派为次；标记已处理、静默降为文字动作；已处理的告警只留“重新打开”。 */}
                <Space className="device-ops-alert-detail__actions" size={8} wrap>
                  {!terminal && selected.status !== "ticketed" &&
                    guard("转工单", <Button disabled={readonly} onClick={() => setTicketOpen(true)} type="primary">转工单</Button>)}
                  {!terminal &&
                    guard("指派", <Button disabled={readonly} onClick={() => setAssignOpen(true)}>指派</Button>)}
                  {!terminal &&
                    guard("处理", <Button disabled={readonly} onClick={() => setResolveOpen(true)} type="link">标记已处理</Button>)}
                  {!terminal &&
                    guard(
                      "静默",
                      <Popconfirm
                        cancelText="取消"
                        description="静默期间该告警不再通知，到期后自动恢复监测。"
                        disabled={readonly}
                        okText="确认静默"
                        onConfirm={() => perform(selected.id, () => deviceOpsStore.mute(selected.id), "已静默 24 小时，到期后自动恢复监测")}
                        title="静默 24 小时？"
                      >
                        <Button disabled={readonly} type="link">静默 24 小时</Button>
                      </Popconfirm>
                    )}
                  {selected.status === "resolved" &&
                    guard(
                      "处理",
                      <Button
                        disabled={readonly}
                        onClick={() => perform(selected.id, () => deviceOpsStore.reopen(selected.id), "已重新打开，告警回到待处理")}
                      >
                        重新打开
                      </Button>
                    )}
                </Space>
              </header>

              <section className="device-ops-alert-section">
                <h3>发生了什么</h3>
                <p>{selected.happened}</p>
              </section>
              <section className="device-ops-alert-section">
                <h3>影响</h3>
                <ul>
                  {selected.impact.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section className="device-ops-alert-section">
                <h3>下一步</h3>
                <ol className="device-ops-steps">
                  {selected.nextSteps.map((step) => (
                    <li key={step.text}>
                      <div className="device-ops-steps__row">
                        <span>{step.text}</span>
                        {renderStepAction(selected, step)}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="device-ops-alert-section">
                <h3>处置记录</h3>
                <ol aria-label="处置记录" className="device-ops-timeline">
                  {selected.events.map((event, index) => (
                    <li key={`${event.at}-${index}`}>
                      <span className="device-ops-num device-ops-timeline__time">{event.at}</span>
                      <span>{event.text}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </article>
          )}
        </div>
      )}

      <Modal
        cancelText="取消"
        destroyOnHidden
        okText="创建工单"
        onCancel={() => setTicketOpen(false)}
        onOk={submitTicket}
        open={ticketOpen}
        title="转工单"
      >
        <Form form={ticketForm} initialValues={ticketInitial} layout="vertical" preserve={false}>
          <Form.Item label="关联对象" name="target">
            <Input readOnly />
          </Form.Item>
          <div className="device-ops-form-row">
            <Form.Item label="类型" name="type">
              <Select options={ticketTypes} />
            </Form.Item>
            <Form.Item label="优先级" name="priority">
              <Select options={priorityOptions} />
            </Form.Item>
          </div>
          <Form.Item label="处理人" name="assignee" rules={[{ required: true, message: "请选择处理人" }]}>
            <Select options={staffOptions} placeholder="请选择处理人" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={9} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        cancelText="取消"
        destroyOnHidden
        okText="确认已处理"
        onCancel={() => setResolveOpen(false)}
        onOk={submitResolve}
        open={resolveOpen}
        title="标记已处理"
      >
        <p className="device-ops-modal-note">处理结论会写入告警的处置记录，之后如需继续跟进可以重新打开。</p>
        <Form form={resolveForm} layout="vertical" preserve={false}>
          <Form.Item label="处理结论" name="conclusion" rules={[{ required: true, message: "请选择处理结论" }]}>
            <Select options={conclusionOptions} placeholder="请选择" />
          </Form.Item>
          <Form.Item
            label="备注"
            name="note"
            rules={[{ required: conclusionValue === "其他", whitespace: true, message: "选择“其他”时请填写备注" }]}
          >
            <Input.TextArea maxLength={200} placeholder={conclusionValue === "其他" ? "请写明处理情况" : "补充处理过程（选填）"} rows={3} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        cancelText="取消"
        destroyOnHidden
        okText="确认指派"
        onCancel={() => { setAssignOpen(false); setAssignee(undefined); }}
        onOk={submitAssign}
        open={assignOpen}
        title="指派处理人"
      >
        <Select className="device-ops-full" onChange={setAssignee} options={staffOptions} placeholder="请选择处理人" value={assignee} />
      </Modal>
    </div>
  );
}
