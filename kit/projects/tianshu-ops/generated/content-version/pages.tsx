import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Alert, Button, Checkbox, Descriptions, Drawer, Form, Input, Modal, Select, Table } from "antd";
import { DownloadOutlined, EyeOutlined, ReloadOutlined, RollbackOutlined, SwapOutlined } from "@ant-design/icons";
import {
  TianshuBadge as Badge,
  TianshuDataSection as DataSection,
  TianshuFilterPanel as FilterPanel,
  TianshuForbiddenState as ForbiddenState,
  TianshuPageHeader as PageHeader,
  TianshuPageLayout as PageLayout
} from "../../native-ui";
import { emitTianshuNotice, navigateTianshu } from "../../demo-actions";
import { mapTableColumns } from "../ant-data";
import "./styles.css";

export type GeneratedPageId = "content-version";

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = {
  "projectId": "tianshu-ops",
  "product": {
    "name": "天枢 · 运营管理平台",
    "description": "供内容运营人员检索内容版本、判断当前状态，并在后续阶段比较差异和执行受控回滚。"
  },
  "outputMode": "library-native",
  "foundation": "antd"
} as const;

type ChangeTypeKey = "publish" | "edit" | "rollback" | "scheduled-on" | "scheduled-off";
type VersionStatusKey = "current" | "historical" | "rolled-back";

type ContentSnapshot = {
  headline: string;
  asset: string;
  targetLink: string;
  activeWindow: string;
  priority: string;
};

type ContentVersionRow = {
  versionId: string;
  version: string;
  contentSlotKey: string;
  contentName: string;
  changeSummary: string;
  changedBy: string;
  changeTypeKey: ChangeTypeKey;
  versionStatusKey: VersionStatusKey;
  publishedAt: string;
  isFromRollback?: boolean;
  rollbackSource?: string;
  snapshot: ContentSnapshot;
};

const changeTypeLabels: Record<ChangeTypeKey, string> = {
  publish: "初始发布",
  edit: "内容编辑",
  rollback: "回滚操作",
  "scheduled-on": "定时上架",
  "scheduled-off": "定时下架"
};

const versionStatusLabels: Record<VersionStatusKey, string> = {
  current: "当前版本",
  historical: "历史版本",
  "rolled-back": "已回滚"
};

const initialContentVersionRows: ContentVersionRow[] = [
  {
    versionId: "home-banner-a-v1-4-0",
    version: "v1.4.0",
    contentSlotKey: "home-banner-a",
    contentName: "首页 Banner A",
    changeSummary: "替换主图并调整跳转链接",
    changedBy: "陈思远",
    changeTypeKey: "edit",
    versionStatusKey: "current",
    publishedAt: "2026-08-18 16:42:09",
    snapshot: {
      headline: "夏日新品首发",
      asset: "banner-summer-launch-v4.webp",
      targetLink: "/campaign/summer-launch",
      activeWindow: "2026-08-18 18:00 至 2026-08-31 23:59",
      priority: "80"
    }
  },
  {
    versionId: "home-banner-a-v1-3-2",
    version: "v1.3.2",
    contentSlotKey: "home-banner-a",
    contentName: "首页 Banner A",
    changeSummary: "更新活动文案与生效时间",
    changedBy: "林晓雨",
    changeTypeKey: "scheduled-on",
    versionStatusKey: "historical",
    publishedAt: "2026-08-15 10:15:30",
    snapshot: {
      headline: "会员夏日福利",
      asset: "banner-member-benefit-v3.webp",
      targetLink: "/campaign/member-benefit",
      activeWindow: "2026-08-15 12:00 至 2026-08-25 23:59",
      priority: "70"
    }
  },
  {
    versionId: "member-day-v2-1-1",
    version: "v2.1.1",
    contentSlotKey: "member-day-theme",
    contentName: "会员日主题",
    changeSummary: "恢复主题页稳定版本",
    changedBy: "周启明",
    changeTypeKey: "rollback",
    versionStatusKey: "current",
    publishedAt: "2026-08-14 19:08:12",
    isFromRollback: true,
    rollbackSource: "v2.1.1",
    snapshot: {
      headline: "本月会员日",
      asset: "member-day-theme-v2-1.webp",
      targetLink: "/member/day",
      activeWindow: "2026-08-14 20:00 至 2026-08-15 23:59",
      priority: "90"
    }
  },
  {
    versionId: "member-day-v2-2-0",
    version: "v2.2.0",
    contentSlotKey: "member-day-theme",
    contentName: "会员日主题",
    changeSummary: "修改优惠说明与按钮文案",
    changedBy: "周启明",
    changeTypeKey: "edit",
    versionStatusKey: "rolled-back",
    publishedAt: "2026-08-14 17:36:54",
    snapshot: {
      headline: "超级会员日",
      asset: "member-day-theme-v2-2.webp",
      targetLink: "/member/super-day",
      activeWindow: "2026-08-14 18:00 至 2026-08-16 23:59",
      priority: "95"
    }
  }
];

const snapshotFields: Array<{ key: keyof ContentSnapshot; label: string }> = [
  { key: "headline", label: "标题" },
  { key: "asset", label: "主图素材" },
  { key: "targetLink", label: "跳转链接" },
  { key: "activeWindow", label: "生效时间" },
  { key: "priority", label: "权重" }
];

function versionStatusBadge(row: ContentVersionRow) {
  const label = versionStatusLabels[row.versionStatusKey];
  const badge = row.versionStatusKey === "current"
    ? <Badge variant="success">{label}</Badge>
    : row.versionStatusKey === "rolled-back"
      ? <Badge variant="warning">{label}</Badge>
      : <Badge variant="secondary">{label}</Badge>;

  return (
    <span className="content-version-page__status-stack">
      {badge}
      {row.isFromRollback ? <Badge variant="secondary">来自回滚</Badge> : null}
    </span>
  );
}

function currentTimestamp() {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    year: "numeric"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

function contentVersionOverlayContainer() {
  return document.querySelector<HTMLElement>(".tianshu-shell") ?? document.body;
}

export function ContentVersionPage() {
  const [rows, setRows] = useState(initialContentVersionRows);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [detailVersionId, setDetailVersionId] = useState<string>();
  const [comparisonVersionId, setComparisonVersionId] = useState<string>();
  const [diffOpen, setDiffOpen] = useState(false);
  const [showOnlyChanges, setShowOnlyChanges] = useState(true);
  const [rollbackVersionId, setRollbackVersionId] = useState<string>();
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"current-page" | "all-filtered">("all-filtered");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState("页面加载时");
  const [rollbackForm] = Form.useForm();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollbackReturnFocus = useRef<HTMLElement | null>(null);
  const rollbackCompleted = useRef(false);

  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    if (rollbackTimer.current) clearTimeout(rollbackTimer.current);
  }, []);

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (filters.contentSlot && row.contentSlotKey !== filters.contentSlot) return false;
    if (filters.version && !row.version.toLowerCase().includes(filters.version.trim().toLowerCase())) return false;
    if (filters.changeType && row.changeTypeKey !== filters.changeType) return false;
    if (filters.versionStatus && row.versionStatusKey !== filters.versionStatus) return false;
    return true;
  }), [filters, rows]);

  const selectedVersion = rows.find((row) => row.versionId === selectedVersionId);
  const detailVersion = rows.find((row) => row.versionId === detailVersionId);
  const comparisonVersion = rows.find((row) => row.versionId === comparisonVersionId);
  const rollbackVersion = rows.find((row) => row.versionId === rollbackVersionId);
  const comparisonCurrent = comparisonVersion
    ? rows.find((row) => row.contentSlotKey === comparisonVersion.contentSlotKey && row.versionStatusKey === "current")
    : undefined;
  const rollbackCurrent = rollbackVersion
    ? rows.find((row) => row.contentSlotKey === rollbackVersion.contentSlotKey && row.versionStatusKey === "current")
    : undefined;
  const canCompareSelected = Boolean(selectedVersion && selectedVersion.versionStatusKey !== "current");
  const comparisonOptions = comparisonVersion
    ? rows
        .filter((row) => row.contentSlotKey === comparisonVersion.contentSlotKey && row.versionStatusKey !== "current")
        .map((row) => ({ label: `${row.version} · ${versionStatusLabels[row.versionStatusKey]}`, value: row.versionId }))
    : [];
  const diffRows = comparisonVersion && comparisonCurrent
    ? snapshotFields.map((field) => ({
        ...field,
        before: comparisonVersion.snapshot[field.key],
        after: comparisonCurrent.snapshot[field.key],
        changed: comparisonVersion.snapshot[field.key] !== comparisonCurrent.snapshot[field.key]
      }))
    : [];
  const visibleDiffRows = showOnlyChanges ? diffRows.filter((row) => row.changed) : diffRows;
  const permissionDenied = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("permission") === "denied";

  const openDetails = (row: ContentVersionRow) => setDetailVersionId(row.versionId);
  const openDiff = (row: ContentVersionRow) => {
    if (row.versionStatusKey === "current") return;
    setComparisonVersionId(row.versionId);
    setShowOnlyChanges(true);
    setDiffOpen(true);
  };
  const openRollback = (row: ContentVersionRow, trigger: HTMLElement) => {
    if (row.versionStatusKey !== "historical") return;
    rollbackCompleted.current = false;
    rollbackReturnFocus.current = trigger;
    setRollbackVersionId(row.versionId);
    rollbackForm.resetFields();
    setRollbackOpen(true);
  };
  const closeRollback = () => {
    setRollbackOpen(false);
    setRollbackSubmitting(false);
  };
  const afterRollbackOpenChange = (open: boolean) => {
    if (open) return;
    const target = rollbackCompleted.current
      ? document.querySelector<HTMLElement>("[data-content-version-refresh]")
      : rollbackReturnFocus.current;
    window.requestAnimationFrame(() => target?.focus());
    rollbackCompleted.current = false;
    setRollbackVersionId(undefined);
  };
  const submitRollback = ({ reason }: { reason: string; confirmed: boolean }) => {
    if (!rollbackVersion || !rollbackCurrent) return;
    setRollbackSubmitting(true);
    rollbackTimer.current = setTimeout(() => {
      const completedAt = currentTimestamp();
      setRows((current) => current.map((row) => {
        if (row.contentSlotKey !== rollbackVersion.contentSlotKey) return row;
        if (row.versionId === rollbackVersion.versionId) {
          return {
            ...row,
            changeSummary: `从 ${rollbackCurrent.version} 回滚，原因：${reason.trim()}`,
            changedBy: "周启明",
            changeTypeKey: "rollback",
            isFromRollback: true,
            publishedAt: completedAt,
            rollbackSource: rollbackVersion.version,
            versionStatusKey: "current"
          };
        }
        if (row.versionId === rollbackCurrent.versionId) {
          return { ...row, isFromRollback: false, versionStatusKey: "rolled-back" };
        }
        return row.versionStatusKey === "current" ? { ...row, versionStatusKey: "historical" } : row;
      }));
      rollbackCompleted.current = true;
      setSelectedVersionId(undefined);
      setDetailVersionId(undefined);
      setDiffOpen(false);
      closeRollback();
      emitTianshuNotice(`已将“${rollbackVersion.contentName}”恢复到 ${rollbackVersion.version}，当前状态已保存在本地演示中。`);
    }, 360);
  };
  const refreshVersions = () => {
    setRefreshing(true);
    refreshTimer.current = setTimeout(() => {
      setRefreshing(false);
      const updatedAt = currentTimestamp().slice(11, 16);
      setLastRefreshed(updatedAt);
      emitTianshuNotice(`版本记录已刷新 · ${updatedAt}`);
    }, 320);
  };
  const applyFilters = (values: Record<string, string>) => {
    setFilters(values);
    setSelectedVersionId(undefined);
    const count = rows.filter((row) => {
      if (values.contentSlot && row.contentSlotKey !== values.contentSlot) return false;
      if (values.version && !row.version.toLowerCase().includes(values.version.trim().toLowerCase())) return false;
      if (values.changeType && row.changeTypeKey !== values.changeType) return false;
      if (values.versionStatus && row.versionStatusKey !== values.versionStatus) return false;
      return true;
    }).length;
    emitTianshuNotice(`筛选已应用，共 ${count} 条版本记录。`);
  };
  const resetFilters = () => {
    setFilters({});
    setSelectedVersionId(undefined);
    emitTianshuNotice("筛选条件已重置。");
  };
  const exportVersions = () => {
    const exportRows = exportScope === "current-page" ? filteredRows.slice(0, 20) : filteredRows;
    const columns = ["版本号", "关联内容位/活动", "变更摘要", "变更人", "变更类型", "版本状态", "发布时间"];
    const values = exportRows.map((row) => [
      row.version,
      row.contentName,
      row.changeSummary,
      row.changedBy,
      changeTypeLabels[row.changeTypeKey],
      versionStatusLabels[row.versionStatusKey],
      row.publishedAt
    ]);
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = `\uFEFF${[columns, ...values].map((line) => line.map(quote).join(",")).join("\r\n")}`;
    const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "content-version-history.csv";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    setExportOpen(false);
    emitTianshuNotice(`已导出 ${exportRows.length} 条版本记录。`);
  };

  if (permissionDenied) {
    return (
      <PageLayout className="content-version-page" density="compact">
        <ForbiddenState
          title="无版本与回滚查看权限"
          description="当前账号缺少 content:version:view。请联系管理员申请权限，或返回内容排期页面。"
          actions={(
            <>
              <Button onClick={() => navigateTianshu("/tianshu/content/schedule")} type="primary">返回排期与发布</Button>
              <Button onClick={() => navigateTianshu("/tianshu/platform/rbac")}>申请权限</Button>
            </>
          )}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout className="content-version-page" density="compact">
      <PageHeader
        title="内容 · 版本与回滚"
        description="检索系统自动生成的内容版本，先确认历史与当前状态，再进入差异比较和受控回滚。"
        actions={(
          <div className="content-version-page__header-actions">
            <Button icon={<DownloadOutlined />} onClick={() => setExportOpen(true)}>导出记录</Button>
            <Button data-content-version-refresh icon={<ReloadOutlined />} loading={refreshing} onClick={refreshVersions}>刷新</Button>
            <Button disabled={!canCompareSelected} onClick={() => selectedVersion && openDiff(selectedVersion)} title={canCompareSelected ? "与当前版本比较" : "选择一个历史版本后可比较"} type="primary">比较版本差异</Button>
          </div>
        )}
      />

      <FilterPanel
        className="content-version-page__filters"
        fields={[
          {
            name: "contentSlot",
            label: "关联内容位/活动",
            type: "select",
            options: [
              { label: "首页 Banner A", value: "home-banner-a" },
              { label: "会员日主题", value: "member-day-theme" },
              { label: "新品首发活动位", value: "launch-slot" }
            ]
          },
          { name: "version", label: "版本号", placeholder: "如 v1.2.0" },
          {
            name: "changeType",
            label: "变更类型",
            type: "select",
            options: [
              { label: "初始发布", value: "publish" },
              { label: "内容编辑", value: "edit" },
              { label: "回滚操作", value: "rollback" },
              { label: "定时上架", value: "scheduled-on" },
              { label: "定时下架", value: "scheduled-off" }
            ]
          },
          {
            name: "versionStatus",
            label: "版本状态",
            type: "select",
            options: [
              { label: "当前版本", value: "current" },
              { label: "历史版本", value: "historical" },
              { label: "已回滚", value: "rolled-back" }
            ]
          }
        ]}
        onReset={resetFilters}
        onSearch={applyFilters}
      />

      <DataSection
        className="content-version-page__data"
        title="版本历史"
        description="版本记录由发布、编辑和回滚动作自动生成，默认按发布时间倒序。"
        loading={refreshing}
        toolbar={<span className="content-version-page__count">{filteredRows.length} 条结果 · 更新于 {lastRefreshed}</span>}
      >
        <div className="tianshu-ui-data-grid tianshu-ui-data-grid--compact content-version-page__grid">
          <div className="tianshu-ui-table-wrap">
            <Table
              className="tianshu-ui-table content-version-page__table"
              columns={mapTableColumns([
                {
                  key: "version",
                  title: "版本号",
                  width: 120,
                  render: (record) => (
                    <button aria-label={`查看 ${record.version} 版本详情`} className="content-version-page__version-link" onClick={() => openDetails(record)} type="button">
                      {record.version}
                    </button>
                  )
                },
                { key: "contentName", title: "关联内容位/活动", width: 168, minReadableWidth: 160 },
                { key: "changeSummary", title: "变更摘要", width: 160, responsive: ["xl", "xxl"] },
                { key: "changedBy", title: "变更人", width: 104, responsive: ["xxl"] },
                { key: "changeType", title: "变更类型", width: 112, responsive: ["xl", "xxl"], render: (record) => <Badge variant="secondary">{changeTypeLabels[record.changeTypeKey as ChangeTypeKey]}</Badge> },
                { key: "versionStatus", title: "版本状态", width: 120, render: (record) => versionStatusBadge(record) },
                { key: "publishedAt", title: "发布时间", width: 160, responsive: ["xl", "xxl"] },
                {
                  key: "actions",
                  title: "操作",
                  fixed: "right",
                  responsive: ["sm", "md", "lg", "xl", "xxl"],
                  width: 132,
                  render: (record) => (
                    <div className="content-version-page__row-actions">
                      <Button icon={<EyeOutlined />} onClick={() => openDetails(record)} size="small" type="link">详情</Button>
                      <Button disabled={record.versionStatusKey === "current"} icon={<SwapOutlined />} onClick={() => openDiff(record)} size="small" title={record.versionStatusKey === "current" ? "当前版本无需与自身比较" : "与当前版本比较"} type="link">Diff</Button>
                    </div>
                  )
                }
              ])}
              dataSource={filteredRows}
              locale={{ emptyText: "当前筛选条件下没有版本记录，请重置筛选后重试。" }}
              pagination={{
                pageSize: 20,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 条`,
                total: filteredRows.length
              }}
              rowClassName={(record) => record.versionId === selectedVersionId ? "content-version-page__row--selected" : ""}
              rowKey="versionId"
              rowSelection={{
                getCheckboxProps: (record) => ({
                  "aria-label": `选择 ${record.version} 与当前版本比较`,
                  disabled: record.versionStatusKey === "current",
                  name: `选择 ${record.version} 与当前版本比较`
                }),
                onChange: (keys) => setSelectedVersionId(keys[0] ? String(keys[0]) : undefined),
                selectedRowKeys: selectedVersionId ? [selectedVersionId] : [],
                type: "radio"
              }}
              scroll={{ x: "max-content" }}
              size="middle"
            />
          </div>
        </div>
      </DataSection>

      <Drawer
        destroyOnHidden
        footer={detailVersion ? (
          <div className="content-version-page__drawer-footer">
            <Button onClick={() => setDetailVersionId(undefined)}>关闭详情</Button>
            <div className="content-version-page__drawer-actions">
              {detailVersion.versionStatusKey !== "current" ? <Button onClick={() => openDiff(detailVersion)}>比较当前版本</Button> : null}
              {detailVersion.versionStatusKey === "historical" ? (
                <Button danger icon={<RollbackOutlined />} onClick={(event) => openRollback(detailVersion, event.currentTarget)}>回滚至此版本</Button>
              ) : null}
            </div>
          </div>
        ) : null}
        getContainer={contentVersionOverlayContainer}
        onClose={() => setDetailVersionId(undefined)}
        open={Boolean(detailVersion)}
        rootClassName="content-version-page__drawer-root content-version-page__drawer-root--detail"
        size="large"
        title={detailVersion ? `版本详情 · ${detailVersion.version}` : "版本详情"}
      >
        {detailVersion ? (
          <div className="content-version-page__drawer-body">
            <section className="content-version-page__drawer-section" aria-labelledby="content-version-overview-title">
              <header className="content-version-page__section-heading">
                <div>
                  <h3 id="content-version-overview-title">版本概览</h3>
                  <p>发布、变更与回滚追溯信息</p>
                </div>
              </header>
              <Descriptions
                bordered
                className="content-version-page__detail-descriptions"
                column={{ xs: 1, sm: 2 }}
                items={[
                  { key: "content", label: "关联内容位/活动", children: detailVersion.contentName },
                  { key: "status", label: "版本状态", children: versionStatusBadge(detailVersion) },
                  { key: "type", label: "变更类型", children: changeTypeLabels[detailVersion.changeTypeKey] },
                  { key: "operator", label: "变更人", children: detailVersion.changedBy },
                  { key: "published", label: "发布时间", children: detailVersion.publishedAt },
                  { key: "source", label: "回滚来源", children: detailVersion.rollbackSource ?? "—" },
                  { key: "summary", label: "变更摘要", children: detailVersion.changeSummary, span: 2 }
                ]}
                size="small"
              />
            </section>
            <section className="content-version-page__snapshot" aria-labelledby="content-version-snapshot-title">
              <header>
                <div>
                  <h3 id="content-version-snapshot-title">内容快照</h3>
                  <p>当前版本内容字段的只读记录</p>
                </div>
                <span>只读预览</span>
              </header>
              <dl>
                {snapshotFields.map((field) => (
                  <div key={field.key}>
                    <dt>{field.label}</dt>
                    <dd>{detailVersion.snapshot[field.key]}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        destroyOnHidden
        footer={comparisonVersion ? (
          <div className="content-version-page__drawer-footer">
            <Button onClick={() => setDiffOpen(false)}>关闭对比</Button>
            <div className="content-version-page__drawer-actions">
              {comparisonVersion.versionStatusKey === "historical" ? (
                <Button danger icon={<RollbackOutlined />} onClick={(event) => openRollback(comparisonVersion, event.currentTarget)}>回滚至此版本</Button>
              ) : null}
            </div>
          </div>
        ) : null}
        getContainer={contentVersionOverlayContainer}
        onClose={() => setDiffOpen(false)}
        open={diffOpen}
        rootClassName="content-version-page__drawer-root content-version-page__drawer-root--diff"
        size="large"
        title={comparisonVersion ? `版本 Diff · ${comparisonVersion.contentName}` : "版本 Diff"}
      >
        {comparisonVersion && comparisonCurrent ? (
          <div className="content-version-page__drawer-body">
            <Alert
              className="content-version-page__overlay-alert"
              description="回滚前请先核对所有差异。执行回滚时，当前版本会保留为一条可追溯记录。"
              showIcon
              title="当前版本将被保存"
              type="info"
            />
            <section className="content-version-page__drawer-section" aria-labelledby="content-version-diff-controls-title">
              <header className="content-version-page__section-heading">
                <div>
                  <h3 id="content-version-diff-controls-title">比较条件</h3>
                  <p>历史版本可切换，当前版本保持只读</p>
                </div>
              </header>
              <div className="content-version-page__diff-controls">
                <label>
                  <span>对比版本</span>
                  <Select onChange={setComparisonVersionId} options={comparisonOptions} value={comparisonVersionId} />
                </label>
                <label>
                  <span>当前版本</span>
                  <Input readOnly value={`${comparisonCurrent.version} · 当前版本`} />
                </label>
                <Checkbox checked={showOnlyChanges} onChange={(event) => setShowOnlyChanges(event.target.checked)}>只看有变化的字段</Checkbox>
              </div>
            </section>
            <section className="content-version-page__drawer-section content-version-page__drawer-section--diff" aria-labelledby="content-version-diff-title">
              <header className="content-version-page__section-heading">
                <div>
                  <h3 id="content-version-diff-title">字段差异</h3>
                  <p>变化字段使用浅色底纹标记</p>
                </div>
                <span className="content-version-page__section-count">{visibleDiffRows.length} 项变化</span>
              </header>
              <div className="content-version-page__diff" aria-label="版本字段差异">
                <div className="content-version-page__diff-head" aria-hidden="true">
                  <strong>字段</strong>
                  <strong>{comparisonVersion.version}</strong>
                  <strong>{comparisonCurrent.version}</strong>
                </div>
                {visibleDiffRows.map((row) => (
                  <div className={`content-version-page__diff-row${row.changed ? " content-version-page__diff-row--changed" : ""}`} key={row.key}>
                    <strong>{row.label}</strong>
                    <span data-version={comparisonVersion.version}>{row.before}</span>
                    <span data-version={comparisonCurrent.version}>{row.after}</span>
                  </div>
                ))}
                {visibleDiffRows.length === 0 ? <p className="content-version-page__diff-empty">两个版本没有字段差异。</p> : null}
              </div>
            </section>
          </div>
        ) : null}
      </Drawer>

      <Modal
        afterOpenChange={afterRollbackOpenChange}
        destroyOnHidden
        footer={rollbackVersion ? (
          <div className="content-version-page__modal-actions">
            <Button onClick={closeRollback}>取消回滚</Button>
            <Button danger form="content-version-rollback-form" htmlType="submit" loading={rollbackSubmitting} type="primary">确认回滚至 {rollbackVersion.version}</Button>
          </div>
        ) : null}
        getContainer={contentVersionOverlayContainer}
        onCancel={closeRollback}
        open={rollbackOpen}
        rootClassName="content-version-page__modal-root content-version-page__modal-root--rollback"
        title="确认回滚内容版本"
      >
        {rollbackVersion && rollbackCurrent ? (
          <Form className="content-version-page__modal-form" form={rollbackForm} id="content-version-rollback-form" layout="vertical" onFinish={submitRollback}>
            <Alert
              className="content-version-page__overlay-alert content-version-page__rollback-alert"
              description={`回滚后，“${rollbackVersion.contentName}”会立即恢复为 ${rollbackVersion.version} 的内容。当前版本 ${rollbackCurrent.version} 将保留为已回滚记录。`}
              showIcon
              title="请确认影响范围"
              type="warning"
            />
            <div className="content-version-page__version-pair">
              <Form.Item label="目标版本"><Input readOnly value={rollbackVersion.version} /></Form.Item>
              <Form.Item label="当前生效版本"><Input readOnly value={rollbackCurrent.version} /></Form.Item>
            </div>
            <Form.Item
              label="回滚原因"
              name="reason"
              rules={[
                { required: true, message: "请填写回滚原因" },
                { min: 10, message: "回滚原因至少填写 10 个字符" },
                { validator: (_, value) => typeof value === "string" && value.trim().length >= 10 ? Promise.resolve() : Promise.reject(new Error("回滚原因不能只包含空格")) }
              ]}
            >
              <Input.TextArea maxLength={200} placeholder="说明异常、影响范围和恢复原因" rows={4} showCount />
            </Form.Item>
            <Form.Item
              className="content-version-page__rollback-confirm"
              name="confirmed"
              valuePropName="checked"
              rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error("请确认回滚影响范围")) }]}
            >
              <Checkbox>我已核对版本差异，并确认将“{rollbackVersion.contentName}”回滚至 {rollbackVersion.version}</Checkbox>
            </Form.Item>
          </Form>
        ) : null}
      </Modal>

      <Modal
        destroyOnHidden
        footer={(
          <div className="content-version-page__modal-actions">
            <Button onClick={() => setExportOpen(false)}>取消导出</Button>
            <Button icon={<DownloadOutlined />} onClick={exportVersions} type="primary">导出 CSV</Button>
          </div>
        )}
        getContainer={contentVersionOverlayContainer}
        onCancel={() => setExportOpen(false)}
        open={exportOpen}
        rootClassName="content-version-page__modal-root content-version-page__modal-root--export"
        title="导出版本记录"
      >
        <div className="content-version-page__export-body">
          <Alert className="content-version-page__overlay-alert" description="导出文件只包含当前页面展示的版本元数据，不包含素材文件或外部业务数据。" showIcon title="导出范围" type="info" />
          <label className="content-version-page__export-field">
            <span>记录范围</span>
            <Select
              onChange={setExportScope}
              options={[
                { label: `当前页（${Math.min(filteredRows.length, 20)} 条）`, value: "current-page" },
                { label: `全部筛选结果（${filteredRows.length} 条）`, value: "all-filtered" }
              ]}
              value={exportScope}
            />
          </label>
        </div>
      </Modal>
    </PageLayout>
  );
}

export const generatedProjectPages: GeneratedProjectPage[] = [
  { id: "content-version", route: "/content/version", title: "内容 · 版本与回滚", pattern: "list-page", component: ContentVersionPage }
];
