import { isValidElement, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  AppShell,
  Badge,
  BulkActionBar,
  Button as KitButton,
  Card,
  CloseOutlined,
  ConfirmDialog,
  DataGrid,
  DataSection,
  DescriptionGrid,
  DetailHeader,
  DownOutlined,
  FilterPanel as KitFilterPanel,
  FormSection,
  Input,
  MetricCard,
  Pagination,
  PageHeader,
  PageLayout,
  AIReadableProvider,
  Select,
  SideNav,
  Stepper,
  Table,
  Tabs,
  Textarea,
  type ButtonProps,
  type FilterPanelProps,
  ThemeName,
  ThemeToggle
} from "@ai-readable/kit";
import { generatedProjectPages } from "../../projects/sample-inventory-erp/generated/pages";
import { generatedProjectPages as tianshuGeneratedPages } from "../../projects/tianshu-ops/generated/pages";
import { TianshuApp } from "../../projects/tianshu-ops/app";
import { DeviceOpsApp } from "../../projects/tianshu-device-ops/app";
import { DeviceOpsEditorBridge } from "./editor/DeviceOpsEditorBridge";
import figmaComponentMap from "../../figma/component-map.json";
import figmaVariablesMap from "../../figma/variables-map.json";
import figmaVariantsMap from "../../figma/variants-map.json";
import feedbackQueue from "../../projects/sample-inventory-erp/feedback/queue.json";
import feedbackPromotionRules from "../../projects/sample-inventory-erp/feedback/promotion-rules.json";
import feedbackPromotionApplications from "../../projects/sample-inventory-erp/feedback/promotions/applications/index.json";
import feedbackPromotionDrafts from "../../projects/sample-inventory-erp/feedback/promotions/index.json";
import { components, patterns } from "./catalog";
import { projectFlows, projectPages } from "./catalog";

type ViewKey = "projects" | "components" | "patterns" | "figma" | "project" | "generated" | "feedback" | "examples";
type ExampleKey = "list" | "dashboard" | "detail" | "form";

import "./styles.css";

const AI_READABLE_LAB_NOTICE_EVENT = "ai-readable-lab:demo-notice";

function actionText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node).trim();
  if (Array.isArray(node)) return node.map(actionText).filter(Boolean).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return actionText(node.props.children);
  return "该操作";
}

function emitLabNotice(message: string) {
  window.dispatchEvent(new CustomEvent<string>(AI_READABLE_LAB_NOTICE_EVENT, { detail: message }));
}

function Button({ onClick, children, disabled, loading, ...props }: ButtonProps) {
  return (
    <KitButton
      {...props}
      disabled={disabled}
      loading={loading}
      onClick={onClick ?? (() => emitLabNotice(`“${actionText(children)}”已触发。当前页面使用固定演示数据。`))}
    >
      {children}
    </KitButton>
  );
}

function FilterPanel({ onSearch, onReset, ...props }: FilterPanelProps) {
  return (
    <KitFilterPanel
      {...props}
      onReset={onReset ?? (() => emitLabNotice("筛选条件已重置。"))}
      onSearch={onSearch ?? ((values) => {
        const activeCount = Object.values(values).filter(Boolean).length;
        emitLabNotice(activeCount > 0 ? `已读取 ${activeCount} 个筛选条件。列表使用固定演示数据。` : "当前没有筛选条件。");
      })}
    />
  );
}

function readPreviewView(): ViewKey {
  const requested = new URLSearchParams(window.location.search).get("view");
  return requested && requested in previewViewLabels ? requested as ViewKey : "projects";
}

function previewViewHref(view: ViewKey) {
  return view === "projects" ? "/" : `/?view=${view}`;
}

const previewViewLabels: Record<ViewKey, string> = {
  projects: "项目成品",
  components: "组件库",
  patterns: "页面模式",
  examples: "页面样例",
  generated: "页面清单",
  project: "项目上下文",
  figma: "Figma 映射",
  feedback: "反馈回流"
};

const previewNavGroups: Array<{ label: string; items: Array<{ key: ViewKey; label: string }> }> = [
  { label: "开始", items: [{ key: "projects", label: "项目成品" }] },
  {
    label: "构建资产",
    items: [
      { key: "components", label: "组件库" },
      { key: "patterns", label: "页面模式" },
      { key: "examples", label: "页面样例" }
    ]
  },
  {
    label: "交付与质量",
    items: [
      { key: "generated", label: "页面清单" },
      { key: "project", label: "项目上下文" },
      { key: "figma", label: "Figma 映射" },
      { key: "feedback", label: "反馈回流" }
    ]
  }
];

const orderRows: Array<Record<string, unknown>> = [
  { id: "ORD-1001", customer: "华云贸易", status: "paid", owner: "林承宇", updatedAt: "2026-07-06" },
  { id: "ORD-1002", customer: "示例科技", status: "pending", owner: "沈若桐", updatedAt: "2026-07-07" },
  { id: "ORD-1003", customer: "环宇实业", status: "risk", owner: "周砚秋", updatedAt: "2026-07-07" }
];

const activityRows: Array<Record<string, unknown>> = [
  { id: "a1", event: "健康检查", time: "09:20" },
  { id: "a2", event: "配置同步", time: "08:42" },
  { id: "a3", event: "权限复核", time: "08:10" }
];

export function PreviewApp() {
  const isTianshuRoute = typeof window !== "undefined" && (
    window.location.pathname === "/tianshu" || window.location.pathname.startsWith("/tianshu/")
  );
  const isDeviceOpsRoute = typeof window !== "undefined" && (
    window.location.pathname === "/device-ops" || window.location.pathname.startsWith("/device-ops/")
  );
  const isSaGoldenRoute = typeof window !== "undefined" && (
    window.location.pathname === "/sa" || window.location.pathname.startsWith("/sa/")
  );
  const isVulnRoute = typeof window !== "undefined" && (
    window.location.pathname === "/vuln" || window.location.pathname.startsWith("/vuln/")
  );
  const isGridRoute = typeof window !== "undefined" && (
    window.location.pathname === "/grid" || window.location.pathname.startsWith("/grid/")
  );
  const isSampleAccessRoute = typeof window !== "undefined" && (
    window.location.pathname === "/sample-access" || window.location.pathname.startsWith("/sample-access/")
  );
  const directRenderTarget = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("render");
  const directPage = directRenderTarget
    ? generatedProjects
        .flatMap((project) => project.pages.map((page) => ({ projectId: project.id, page })))
        .find((entry) => `${entry.projectId}:${entry.page.id}` === directRenderTarget)?.page
    : null;
  const [theme, setTheme] = useState<Exclude<ThemeName, "screen">>("vivid");
  const [view, setView] = useState<ViewKey>(() => typeof window === "undefined" ? "projects" : readPreviewView());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackItemCount = feedbackQueue.items.length;
  const promotionDraftCount = feedbackPromotionDrafts.drafts.length;
  const applicationPlanCount = feedbackPromotionApplications.plans.length;

  const openView = (nextView: ViewKey, replace = false) => {
    const href = previewViewHref(nextView);
    if (replace) window.history.replaceState({}, "", href);
    else if (nextView !== view) window.history.pushState({}, "", href);
    setView(nextView);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  useEffect(() => {
    if (isTianshuRoute || isDeviceOpsRoute || isSaGoldenRoute || isVulnRoute || isGridRoute || isSampleAccessRoute || directPage) return;
    document.title = `${previewViewLabels[view]} · Ludi Design Lab`;
  }, [directPage, isDeviceOpsRoute, isSaGoldenRoute, isTianshuRoute, isVulnRoute, isGridRoute, isSampleAccessRoute, view]);

  useEffect(() => {
    if (isTianshuRoute || isDeviceOpsRoute || isSaGoldenRoute || isVulnRoute || isGridRoute || isSampleAccessRoute || directPage) return;
    const onPopState = () => {
      setView(readPreviewView());
      setMobileNavOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [directPage, isDeviceOpsRoute, isSaGoldenRoute, isTianshuRoute, isVulnRoute, isGridRoute, isSampleAccessRoute]);

  useEffect(() => {
    if (isTianshuRoute || isDeviceOpsRoute || isSaGoldenRoute || isVulnRoute || isGridRoute || isSampleAccessRoute || directPage) return;
    const onNotice = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (!message) return;
      setNotice(message);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(""), 3600);
    };
    window.addEventListener(AI_READABLE_LAB_NOTICE_EVENT, onNotice);
    return () => {
      window.removeEventListener(AI_READABLE_LAB_NOTICE_EVENT, onNotice);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [directPage, isDeviceOpsRoute, isSaGoldenRoute, isTianshuRoute, isVulnRoute, isGridRoute, isSampleAccessRoute]);

  const handleNavClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== "/") return;
    const requested = url.searchParams.get("view");
    const nextView = requested && requested in previewViewLabels ? requested as ViewKey : "projects";
    event.preventDefault();
    openView(nextView);
  };

  if (isTianshuRoute) return <TianshuApp />;

  if (isDeviceOpsRoute) {
    // 仅 `?editor=1` 挂在编辑器接收器（主题草稿内存覆盖与组件点选）；普通预览不接收消息。
    const editorChild = new URLSearchParams(window.location.search).get("editor") === "1";
    return editorChild ? <DeviceOpsEditorBridge /> : <DeviceOpsApp />;
  }
  if (directPage) {
    const DirectGeneratedPage = directPage.component;
    return (
      <AIReadableProvider theme="vivid">
        <DirectGeneratedPage />
      </AIReadableProvider>
    );
  }

  return (
    <AIReadableProvider theme={theme}>
      <AppShell
        className="preview-shell"
        nav={
          <div className="preview-nav" data-mobile-open={mobileNavOpen ? "true" : "false"} onClick={handleNavClick}>
            <div className="preview-nav__head">
              <a className="preview-brand" href="/">
                <strong>Ludi Design Lab</strong>
                <span>内部开发与验收</span>
              </a>
              <button
                aria-controls="preview-navigation-groups"
                aria-expanded={mobileNavOpen}
                aria-label={mobileNavOpen ? "收起导航" : "展开导航"}
                className="preview-nav__toggle"
                onClick={() => setMobileNavOpen((open) => !open)}
                type="button"
              >
                {mobileNavOpen ? <CloseOutlined aria-hidden="true" aria-label={undefined} /> : <DownOutlined aria-hidden="true" aria-label={undefined} />}
              </button>
            </div>
            <div className="preview-nav__groups" id="preview-navigation-groups">
              {previewNavGroups.map((group) => (
                <section className="preview-nav__group" key={group.label}>
                  <h2>{group.label}</h2>
                  <SideNav
                    activeKey={view}
                    ariaLabel={`${group.label}导航`}
                    items={group.items.map((item) => ({ ...item, href: previewViewHref(item.key) }))}
                  />
                </section>
              ))}
            </div>
          </div>
        }
        header={
          <div className="preview-topbar">
            <div className="preview-topbar__context">
              <Badge appearance="outline" variant="secondary">内部工作台</Badge>
              <strong>{previewViewLabels[view]}</strong>
            </div>
            <ThemeToggle value={theme} onChange={setTheme} />
          </div>
        }
      >
        <PageLayout className="preview-page-layout">
          {view === "projects" ? (
            <LabHome
              applicationPlanCount={applicationPlanCount}
              feedbackItemCount={feedbackItemCount}
              promotionDraftCount={promotionDraftCount}
              onOpenView={openView}
            />
          ) : null}
          {view === "components" ? <ComponentGallery /> : null}
          {view === "patterns" ? <PatternGallery /> : null}
          {view === "figma" ? <FigmaMappingGallery /> : null}
          {view === "project" ? <ProjectContext /> : null}
          {view === "generated" ? <GeneratedProjectGallery /> : null}
          {view === "feedback" ? <FeedbackGallery /> : null}
          {view === "examples" ? <ExamplesGallery /> : null}
        </PageLayout>
      </AppShell>
      <div className={`preview-toast${notice ? " preview-toast--visible" : ""}`} role="status" aria-live="polite">
        {notice}
      </div>
    </AIReadableProvider>
  );
}

function FeedbackGallery() {
  const items = feedbackQueue.items;
  const drafts = feedbackPromotionDrafts.drafts;
  const applicationPlans = feedbackPromotionApplications.plans;
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null);
  const queuedCount = items.filter((item) => item.status === "queued").length;
  const acceptedCount = items.filter((item) => item.status === "accepted").length;
  const highPriorityCount = items.filter((item) => item.severity === "high" || item.severity === "critical").length;
  const targetCounts = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.target] = (acc[item.target] ?? 0) + 1;
      return acc;
    }, {});
  }, []);

  return (
    <div className="preview-stack t-reveal">
      <PageHeader
        title="回流队列"
        description="把生成页面暴露的发现，经评审晋升为规则、组件、token、页面规划或示例的审查队列。"
        actions={<Badge appearance="outline" variant="secondary">{applicationPlans.length} 份应用计划</Badge>}
      />
      <div className="feedback-summary-grid">
        <MetricCard label="排队中" value={queuedCount} hint="待评审" />
        <MetricCard label="已接受" value={acceptedCount} hint="可出草案" />
        <MetricCard label="晋升草案" value={drafts.length} hint="已生成" />
        <MetricCard label="应用计划" value={applicationPlans.length} hint={`${highPriorityCount} 条高优先级`} />
      </div>
      <section className="preview-section">
        <div className="preview-section__header">
          <h2>评审队列</h2>
          <Badge variant="primary">{feedbackQueue.projectId}</Badge>
        </div>
        <div className="feedback-queue-grid">
          {items.map((item) => (
            <article className="feedback-card" key={item.id}>
              <header>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.finding}</p>
                </div>
                <div className="feedback-card__badges">
                  <Badge variant={feedbackStatusVariant(item.status)}>{item.status}</Badge>
                  <Badge variant={feedbackSeverityVariant(item.severity)}>{item.severity}</Badge>
                </div>
              </header>
              <div className="feedback-card__meta">
                <span>{item.target}</span>
                <span>{item.source}</span>
                <span>{item.pageId}</span>
              </div>
              <div className="feedback-card__promotion">
                <strong>{item.promotion.action}</strong>
                <span>{item.promotion.destination}</span>
              </div>
              <div className="feedback-card__acceptance">
                {item.acceptance.slice(0, expandedFeedbackId === item.id ? item.acceptance.length : 2).map((check) => (
                  <span key={`${item.id}-${check}`}>{check}</span>
                ))}
              </div>
              <Button
                aria-label={`查看 ${item.title} 验收条件`}
                variant="ghost"
                onClick={() => setExpandedFeedbackId((current) => current === item.id ? null : item.id)}
              >
                {expandedFeedbackId === item.id ? "收起验收条件" : "查看验收条件"}
              </Button>
            </article>
          ))}
        </div>
        <div className="preview-selection-feedback" role="status" aria-live="polite">
          {expandedFeedbackId
            ? `当前展开：${items.find((item) => item.id === expandedFeedbackId)?.title}`
            : "选择一条反馈查看完整验收条件。"}
        </div>
      </section>
      <section className="preview-section">
        <div className="preview-section__header">
          <h2>晋升草案</h2>
          <Badge variant="success">{feedbackPromotionDrafts.generatedAt}</Badge>
        </div>
        <div className="promotion-draft-grid">
          {drafts.map((draft) => (
            <article className="promotion-draft-card" key={draft.itemId}>
              <header>
                <div>
                  <h3>{draft.title}</h3>
                  <p>{draft.action} · {draft.destination}</p>
                </div>
                <Badge variant="success">{draft.status}</Badge>
              </header>
              <div className="promotion-draft-card__path">{draft.draftFile}</div>
              <div className="promotion-draft-card__scope">
                {draft.patchDraft
                  .split("\n")
                  .filter((line) => line.startsWith("diff --git"))
                  .map((line) => (
                    <span key={`${draft.itemId}-${line}`}>{line.replace("diff --git a/", "")}</span>
                  ))}
              </div>
              <ol>
                {draft.todos.slice(0, 3).map((todo) => (
                  <li key={`${draft.itemId}-${todo}`}>{todo}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </section>
      <section className="preview-section">
        <div className="preview-section__header">
          <h2>应用预览</h2>
          <Badge variant="info">{feedbackPromotionApplications.generatedAt}</Badge>
        </div>
        <div className="promotion-apply-grid">
          {applicationPlans.map((plan) => (
            <article className="promotion-apply-card" key={plan.itemId}>
              <header>
                <div>
                  <h3>{plan.title}</h3>
                  <p>{plan.action} · {plan.destination}</p>
                </div>
                <Badge variant="info">{plan.mode}</Badge>
              </header>
              <div className="promotion-apply-card__path">{plan.patchFile}</div>
              <div className="promotion-apply-card__scope">
                {plan.willChangeFiles.map((file) => (
                  <span key={`${plan.itemId}-${file}`}>{file}</span>
                ))}
              </div>
              <ol>
                {plan.validationCommands.slice(0, 5).map((command) => (
                  <li key={`${plan.itemId}-${command}`}>{command}</li>
                ))}
              </ol>
              <div className="promotion-apply-card__command">{plan.command}</div>
            </article>
          ))}
        </div>
      </section>
      <section className="preview-section">
        <div className="preview-section__header">
          <h2>晋升规则</h2>
          <Badge variant="success">{Object.keys(targetCounts).length} 类生效目标</Badge>
        </div>
        <Table
          rowKey="target"
          dataSource={feedbackPromotionRules.gates}
          columns={[
            { key: "target", title: "目标" },
            {
              key: "allowedActions",
              title: "允许动作",
              render: (record) => (record.allowedActions as string[]).join(", ")
            },
            {
              key: "allowedDestinations",
              title: "允许去向",
              render: (record) => (record.allowedDestinations as string[]).join(", ")
            },
            {
              key: "reviewChecklist",
              title: "检查项",
              render: (record) => `${(record.reviewChecklist as string[]).length} 项`
            }
          ]}
        />
      </section>
    </div>
  );
}

function FigmaMappingGallery() {
  const [selectedMapping, setSelectedMapping] = useState(figmaComponentMap.components[0]?.codeComponent ?? "");
  const variablesByCategory = useMemo(() => {
    return figmaVariablesMap.variables.reduce<Record<string, typeof figmaVariablesMap.variables>>((acc, variable) => {
      acc[variable.category] ??= [];
      acc[variable.category].push(variable);
      return acc;
    }, {});
  }, []);

  return (
    <div className="preview-stack t-reveal">
      <PageHeader
        title="Figma 映射"
        description="以代码为基准，对齐 Figma 组件、变量与 variant 属性。"
        actions={<Badge appearance="outline" variant="secondary">已映射 {figmaComponentMap.components.length} 个组件</Badge>}
      />
      <div className="figma-summary-grid">
        <MetricCard label="组件映射" value={figmaComponentMap.components.length} hint="Figma → 代码" />
        <MetricCard label="变量映射" value={figmaVariablesMap.variables.length} hint="token 对齐" />
        <MetricCard label="variant 映射" value={figmaVariantsMap.mappings.length} hint="props 契约" />
      </div>
      <section className="preview-section">
        <div className="preview-section__header">
          <h2>组件映射表</h2>
          <Badge variant="primary">{figmaComponentMap.status}</Badge>
        </div>
        <div className="figma-map-grid">
          {figmaComponentMap.components.slice(0, 8).map((item) => (
            <article className="figma-map-card" key={item.codeComponent}>
              <div>
                <h3>{item.figmaComponent}</h3>
                <p>{item.layoutRole}</p>
              </div>
              <Badge variant="info" appearance="outline">
                {item.codeComponent}
              </Badge>
              <Button
                aria-label={`检查 ${item.codeComponent} 映射`}
                variant="ghost"
                onClick={() => setSelectedMapping(item.codeComponent)}
              >
                检查映射
              </Button>
            </article>
          ))}
        </div>
        <div className="preview-selection-feedback" role="status" aria-live="polite">
          当前映射：{selectedMapping}
        </div>
      </section>
      <section className="preview-section">
        <div className="preview-section__header">
          <h2>变量覆盖</h2>
          <Badge variant="secondary">{Object.keys(variablesByCategory).length} 组</Badge>
        </div>
        <div className="figma-token-grid">
          {Object.entries(variablesByCategory).map(([category, items]) => (
            <article className="figma-token-card" key={category}>
              <strong>{category}</strong>
              <span>{items.length} 个变量</span>
              <small>{items[0]?.figmaVariable}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="preview-section">
        <div className="preview-section__header">
          <h2>variant → prop 对照</h2>
          <Badge variant="success">{figmaVariantsMap.mappings.length}</Badge>
        </div>
        <Table
          rowKey={(record, index) => `${record.codeComponent}-${record.figmaProperty}-${index}`}
          dataSource={figmaVariantsMap.mappings.slice(0, 10)}
          columns={[
            { key: "figmaComponent", title: "Figma" },
            { key: "figmaProperty", title: "Figma 属性" },
            { key: "codeComponent", title: "代码组件" },
            {
              key: "props",
              title: "Props",
              render: (record) => record.props.join(", ")
            },
            {
              key: "values",
              title: "取值",
              render: (record) => Object.keys(record.values as Record<string, unknown>).join(", ")
            }
          ]}
        />
      </section>
    </div>
  );
}

function feedbackSeverityVariant(severity: string): "secondary" | "warning" | "danger" | "info" {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  if (severity === "medium") return "info";
  return "secondary";
}

function feedbackStatusVariant(status: string): "secondary" | "success" | "warning" | "danger" {
  if (status === "accepted" || status === "promoted") return "success";
  if (status === "rejected") return "danger";
  if (status === "queued") return "warning";
  return "secondary";
}

const generatedProjects = [
  { id: "tianshu-ops", label: "小豆盒运营平台 · real-product", pages: tianshuGeneratedPages },
  { id: "sample-inventory-erp", label: "Sample ERP · sandbox", pages: generatedProjectPages }
];

function GeneratedProjectGallery() {
  const [projectId, setProjectId] = useState(generatedProjects[0].id);
  const project = generatedProjects.find((entry) => entry.id === projectId) ?? generatedProjects[0];
  const [pageId, setPageId] = useState("");
  const activePage = project.pages.find((page) => page.id === pageId) ?? project.pages[0];
  const GeneratedPage = activePage.component;

  return (
    <div className="preview-stack t-reveal">
      <PageHeader
        title="生成页面"
        description="由 pages.json 生成、经 kit public API 渲染的可运行页面骨架。"
        actions={<Badge appearance="outline" variant="secondary">{generatedProjects.reduce((sum, entry) => sum + entry.pages.length, 0)} 个生成页面</Badge>}
      />
      <div className="generated-switch" role="tablist" aria-label="生成项目">
        {generatedProjects.map((entry) => (
          <button
            aria-selected={project.id === entry.id}
            className="generated-switch__item"
            key={entry.id}
            type="button"
            onClick={() => {
              setProjectId(entry.id);
              setPageId("");
            }}
          >
            <span>{entry.label}</span>
            <small>{entry.pages.length} 页</small>
          </button>
        ))}
      </div>
      <div className="generated-switch" role="tablist" aria-label="项目页面">
        {project.pages.map((page) => (
          <button
            aria-selected={activePage.id === page.id}
            className="generated-switch__item"
            key={page.id}
            type="button"
            onClick={() => setPageId(page.id)}
          >
            <span>{page.title}</span>
            <small>{page.route}</small>
          </button>
        ))}
      </div>
      <div className="generated-preview-canvas">
        <GeneratedPage />
      </div>
    </div>
  );
}

function ProjectContext() {
  const flows = projectFlows.flows;
  const pages = projectPages.pages;
  const [selectedFlowId, setSelectedFlowId] = useState(flows[0]?.id ?? "");

  return (
    <div className="preview-stack t-reveal">
      <PageHeader
        title="项目上下文"
        description="Sample Inventory ERP（sandbox）验证 PRD 驱动的流程卡、意图卡与页面规划。"
        actions={<Badge appearance="outline" variant="secondary">{pages.length} 个规划页面</Badge>}
      />
      <section className="preview-section">
        <div className="preview-section__header">
          <h2>流程卡</h2>
          <Badge variant="primary">{flows.length}</Badge>
        </div>
        <div className="flow-grid">
          {flows.map((flow) => (
            <article className="flow-card" key={flow.id}>
              <div>
                <h3>{flow.title}</h3>
                <p>{flow.userGoal}</p>
              </div>
              <ol>
                {flow.steps.map((step) => (
                  <li key={`${flow.id}-${step.pageId}`}>
                    <span>{step.route}</span>
                    <Badge variant="secondary" appearance="outline">
                      {step.role}
                    </Badge>
                  </li>
                ))}
              </ol>
              <Button
                aria-label={`查看 ${flow.title} 流程`}
                variant="ghost"
                onClick={() => setSelectedFlowId(flow.id)}
              >
                查看流程
              </Button>
            </article>
          ))}
        </div>
        <div className="preview-selection-feedback" role="status" aria-live="polite">
          当前流程：{flows.find((flow) => flow.id === selectedFlowId)?.title}
        </div>
      </section>
      <section className="preview-section">
        <div className="preview-section__header">
          <h2>页面意图卡</h2>
          <Badge variant="info">{pages.length}</Badge>
        </div>
        <div className="page-plan-grid">
          {pages.map((page) => (
            <article className="page-plan-card" key={page.id}>
              <header>
                <div>
                  <h3>{page.title}</h3>
                  <p>{page.intentCard.pageGoal}</p>
                </div>
                <Badge variant="success" appearance="outline">
                  {page.pattern}
                </Badge>
              </header>
              <div className="page-plan-card__route">{page.route}</div>
              <div className="page-plan-card__components">
                {page.componentPlan.map((component) => (
                  <span key={`${page.id}-${component}`}>{component}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ComponentGallery() {
  const groups = useMemo(() => {
    return components.reduce<Record<string, typeof components>>((acc, component) => {
      acc[component.category] ??= [];
      acc[component.category].push(component);
      return acc;
    }, {});
  }, []);

  return (
    <div className="preview-stack t-reveal">
      <PageHeader
        title="组件总览"
        description="公开组件清单：供 AI 选型、代码评审与视觉走查。"
        actions={<Badge appearance="outline" variant="secondary">{components.length} 个组件</Badge>}
      />
      <section className="preview-board preview-board--overview">
        <div className="preview-board__main">
          <h2>核心控件</h2>
          <p>多数生成页面共用的基础控件与状态映射。</p>
          <div className="preview-demo-row">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="danger">Danger</Button>
            <Button loading variant="secondary">保存中</Button>
            <Button disabled title="需要权限" variant="ghost">无权限</Button>
          </div>
          <div className="preview-demo-row">
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="processing">Processing</Badge>
            <Badge variant="geekblue">Geekblue</Badge>
            <Badge variant="cyan">Cyan</Badge>
            <Badge variant="purple">Purple</Badge>
            <Badge appearance="solid" variant="danger">Danger Solid</Badge>
            <Badge appearance="outline" variant="processing">Processing Outline</Badge>
          </div>
          <Tabs
            variant="card"
            items={[
              { key: "overview", label: "概览", content: <span>概览面板</span> },
              { key: "activity", label: "动态", content: <span>动态面板</span> }
            ]}
          />
          <Pagination disabled page={2} pageSize={20} total={60} />
          <div className="preview-data-states">
            <Table
              className="preview-empty-table"
              columns={[{ key: "state", title: "空态表格" }]}
              dataSource={[]}
              empty="没有匹配的记录"
            />
            <DataGrid
              className="preview-loading-grid"
              columns={[{ key: "state", title: "加载中表格" }]}
              dataSource={[]}
              loading
            />
          </div>
        </div>
        <div className="preview-board__side">
          <Input label="搜索字段" placeholder="请输入字段名称" />
          <Select
            label="状态"
            placeholder="请选择状态"
            options={[
              { label: "启用", value: "active" },
              { label: "复核中", value: "review" }
            ]}
          />
          <Textarea label="备注" placeholder="请输入备注" rows={3} />
        </div>
      </section>

      {Object.entries(groups).map(([category, items]) => (
        <section className="preview-section" key={category}>
          <div className="preview-section__header">
            <h2>{category}</h2>
            <Badge variant="secondary">{items.length}</Badge>
          </div>
          <div className="component-grid">
            {items.map((component) => (
              <article className="component-card" key={component.name}>
                <div>
                  <h3>{component.name}</h3>
                  <p>{component.useWhen}</p>
                </div>
                <div className="component-card__meta">
                  <Badge variant="info" appearance="outline">
                    {component.role}
                  </Badge>
                  <span>{component.variants.join(" · ")}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PatternGallery() {
  const [selectedPatternName, setSelectedPatternName] = useState(patterns[0]?.name ?? "");

  return (
    <div className="preview-stack t-reveal">
      <PageHeader
        title="页面模式"
        description="生成细节前先套用的标准页面结构。"
        actions={<Badge appearance="outline" variant="secondary">{patterns.length} 种模式</Badge>}
      />
      <div className="pattern-grid">
        {patterns.map((pattern, index) => (
          <article className="pattern-card" key={pattern.name}>
            <div className="pattern-card__index">{index + 1}</div>
            <div>
              <h2>{pattern.title}</h2>
              <p>{pattern.useWhen}</p>
            </div>
            <ol>
              {pattern.structure.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <Button
              aria-label={`选用 ${pattern.title}`}
              variant={selectedPatternName === pattern.name ? "secondary" : "ghost"}
              onClick={() => setSelectedPatternName(pattern.name)}
            >
              {selectedPatternName === pattern.name ? "已选用" : "选用模式"}
            </Button>
          </article>
        ))}
      </div>
      <div className="preview-selection-feedback" role="status" aria-live="polite">
        当前模式：{patterns.find((pattern) => pattern.name === selectedPatternName)?.title}
      </div>
      <section className="preview-section">
        <div className="preview-section__header">
          <h2>决策检查</h2>
          <Badge variant="primary">Layout → Module → Details</Badge>
        </div>
        <Stepper
          currentKey="module"
          items={[
            { key: "layout", title: "Layout 布局", description: "选页面外壳与原型" },
            { key: "module", title: "Module 模块", description: "按 manifest 选 kit 组件" },
            { key: "details", title: "Details 细节", description: "调文案、状态、密度与 token" }
          ]}
        />
      </section>
    </div>
  );
}

function ExamplesGallery() {
  const [example, setExample] = useState<ExampleKey>("list");

  return (
    <div className="preview-stack t-reveal">
      <PageHeader
        title="示例页"
        description="可运行的页面样例：AI 只模仿用法，不抄内部实现。"
        actions={<Badge appearance="outline" variant="secondary">全部来自 public API</Badge>}
      />
      <div className="example-switch" role="tablist" aria-label="示例页面">
        {[
          ["list", "列表页"],
          ["dashboard", "工作台"],
          ["detail", "详情页"],
          ["form", "表单页"]
        ].map(([key, label]) => (
          <button
            aria-selected={example === key}
            className="example-switch__item"
            key={key}
            type="button"
            onClick={() => setExample(key as ExampleKey)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="example-canvas" data-example={example}>
        {example === "list" ? <ListExample /> : null}
        {example === "dashboard" ? <DashboardExample /> : null}
        {example === "detail" ? <DetailExample /> : null}
        {example === "form" ? <FormExample /> : null}
      </div>
    </div>
  );
}

function ListExample() {
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const listFocusRef = useRef<HTMLElement>(null);

  const confirmDelete = () => {
    setDeleteLoading(true);
    window.setTimeout(() => {
      setDeleteLoading(false);
      setDeleteOpen(false);
      setSelectedRowKeys([]);
    }, 900);
  };

  return (
    <div className="example-page">
      <PageHeader
        title="订单管理"
        description="跟踪订单状态、负责人与最近更新。"
        actions={<Button>新建订单</Button>}
      />
      <FilterPanel
        fields={[
          { name: "keyword", label: "关键字", placeholder: "订单号或客户" },
          {
            name: "status",
            label: "状态",
            type: "select",
            options: [
              { label: "已支付", value: "paid" },
              { label: "待处理", value: "pending" },
              { label: "风险", value: "risk" }
            ]
          }
        ]}
      />
      <DataSection ref={listFocusRef} title="订单列表" toolbar={<Button variant="outline">导出</Button>}>
        <DataGrid
          rowKey="id"
          rowSelection
          sortable
          dataSource={orderRows}
          columns={[
            { key: "id", title: "订单号" },
            { key: "customer", title: "客户" },
            {
              key: "status",
              title: "状态",
              render: (record) => <StatusBadge status={String(record.status)} />
            },
            { key: "owner", title: "负责人" },
            { key: "updatedAt", title: "更新时间" }
          ]}
          pagination={<Pagination pageSize={20} total={124} />}
          selectedRowKeys={selectedRowKeys}
          onSelectionChange={setSelectedRowKeys}
        />
        <BulkActionBar selectedCount={selectedRowKeys.length} onClearSelection={() => setSelectedRowKeys([])}>
          <Button danger variant="outline" onClick={() => setDeleteOpen(true)}>删除选中订单</Button>
        </BulkActionBar>
      </DataSection>
      <ConfirmDialog
        danger
        confirmLabel="确认删除"
        description={`将永久删除当前选中的 ${selectedRowKeys.length} 个订单，删除后数据不可恢复。`}
        focusFallbackRef={listFocusRef}
        loading={deleteLoading}
        open={deleteOpen}
        title="删除选中订单？"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function LabHome({
  applicationPlanCount,
  feedbackItemCount,
  promotionDraftCount,
  onOpenView
}: {
  applicationPlanCount: number;
  feedbackItemCount: number;
  promotionDraftCount: number;
  onOpenView: (view: ViewKey) => void;
}) {
  const productEntries = [
    {
      name: "小豆盒设备运营",
      url: "/device-ops",
      foundation: "antd / shadcn / EP 一致",
      pages: "14 路由",
      blurb: "四底座视觉一致专项的设备运营主体，持续迭代的主力。",
      flagship: true
    },
    {
      name: "小豆盒运营管理平台",
      url: "/tianshu/dashboard",
      foundation: "Ant Design 6.5.0",
      pages: "16 页",
      blurb: "生产履约、平台权限、广告变现与内容运营的统一工作壳。较早批次完成，走查已清零。"
    },
  ];
  const libraryLinks: Array<{ view: ViewKey; label: string; hint: string }> = [
    { view: "components", label: "组件库", hint: `${components.length} 个公开组件` },
    { view: "patterns", label: "页面模式", hint: `${patterns.length} 种标准结构` },
    { view: "generated", label: "生成页面", hint: "项目内生成页的总览与跳转" },
    { view: "examples", label: "示例页", hint: "列表/工作台/详情/表单样例" },
    { view: "figma", label: "Figma 映射", hint: "组件、变量与变体合同" },
    { view: "feedback", label: "反馈回流", hint: `${feedbackItemCount} 条 · 草案 ${promotionDraftCount} · 计划 ${applicationPlanCount}` },
    { view: "project", label: "项目上下文", hint: "流程卡、意图卡与页面规划" }
  ];

  return (
    <div className="labv2">
      <header className="labv2-hero">
        <div className="labv2-hero__meta">
          <span className="labv2-badge">内部设计系统实验台</span>
          <span>已完成 B 端界面 · 编辑器 · 组件库资产</span>
        </div>
        <h1>所有做过的界面，一目了然</h1>
        <p>
          面向新手上路的第一站：先打开完成的产品界面体验，再进编辑器调组件；
          组件库和规范资料沉在最下面，按需再查。
        </p>
        <dl aria-label="当前规模">
          <div><dt>产品界面</dt><dd>5 个</dd></div>
          <div><dt>组件库编辑器</dt><dd>1 个</dd></div>
          <div><dt>页面总数</dt><dd>60+ 页</dd></div>
        </dl>
      </header>

      <section aria-labelledby="labv2-product-title" className="labv2-section">
        <div className="labv2-section__head">
          <div>
            <h2 id="labv2-product-title">产品界面</h2>
            <p>每一个已完成的 B 端后台，点卡片直接进去逛。</p>
          </div>
          <span className="labv2-badge labv2-badge--quiet">主场景</span>
        </div>
        <div className="labv2-grid">
          {productEntries.map((entry) => (
            <a className="labv2-card" href={entry.url} key={entry.name}>
              <div className="labv2-card__head">
                <h3>
                  {entry.name}
                  {"flagship" in entry && entry.flagship ? (
                    <span className="labv2-badge labv2-badge--quiet labv2-card__flag">主力</span>
                  ) : null}
                </h3>
                <span aria-hidden="true" className="labv2-card__arrow">→</span>
              </div>
              <p>{entry.blurb}</p>
              <footer>
                <span>{entry.foundation}</span>
                <span>{entry.pages}</span>
              </footer>
            </a>
          ))}
        </div>
      </section>

      <section aria-labelledby="labv2-editor-title" className="labv2-section">
        <div className="labv2-section__head">
          <div>
            <h2 id="labv2-editor-title">组件库编辑器</h2>
            <p>想调组件、看 AI 改写页面的去玩这个。</p>
          </div>
          <span className="labv2-badge labv2-badge--quiet">主场景</span>
        </div>
        <div className="labv2-editor-card">
          <div className="labv2-editor-card__info">
            <h3>可视化编辑器</h3>
            <p>对区块做可视化点选、改写和属性调整；本机 AI 底座真实驱动。</p>
            <ul>
              <li>区块点选与属性调整</li>
              <li>AI 改写与影响面提示</li>
              <li>主题草稿与四底座一致</li>
            </ul>
          </div>
          <div className="labv2-editor-card__cta">
            <a className="labv2-cta-button" href="/editor">打开编辑器 <span aria-hidden="true">→</span></a>
            <span>进入后左侧边栏点「编辑」进入区块模式</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="labv2-assets-title" className="labv2-section labv2-section--assets">
        <div className="labv2-section__head">
          <div>
            <h2 id="labv2-assets-title">库资产与质量台账</h2>
            <p>kit 官方通用组件库与验收资料，查到的时候进来。</p>
          </div>
          <span className="labv2-badge labv2-badge--quiet">低优先级</span>
        </div>
        <div className="labv2-asset-grid">
          {libraryLinks.map((link) => (
            <button className="labv2-asset-card" key={link.label} onClick={() => onOpenView(link.view)} type="button">
              <strong>{link.label}</strong>
              <span>{link.hint}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function DashboardExample() {
  return (
    <div className="example-page">
      <PageHeader
        title="运营工作台"
        description="每日运营信号一屏过目。"
        actions={<Button>刷新</Button>}
      />
      <div className="metric-grid">
        <MetricCard label="营收" value="¥128 万" delta="+12%" trend="up" />
        <MetricCard label="待处理问题" value="18" delta="-4" trend="down" />
        <MetricCard label="SLA" value="98.4" unit="%" delta="+0.8%" trend="up" />
      </div>
      <div className="example-two-col">
        <Card title="告警" extra={<Badge variant="warning">3 条进行中</Badge>}>
          周报前先复核告警项。
        </Card>
        <Card title="吞吐概览">已处理订单、已处置异常与待复核队列。</Card>
      </div>
    </div>
  );
}

function DetailExample() {
  return (
    <div className="example-page">
      <DetailHeader
        title="设备 AC-204"
        subtitle="产线传感器"
        avatar="AC"
        status={<Badge variant="success">健康</Badge>}
        actions={<Button variant="outline">查看日志</Button>}
      />
      <DescriptionGrid
        items={[
          { label: "归属", value: "平台组" },
          { label: "区域", value: "华东机房" },
          { label: "最近巡检", value: "2026-07-07 09:20" }
        ]}
      />
      <Tabs
        items={[
          {
            key: "activity",
            label: "动态",
            content: (
              <Table
                rowKey="id"
                dataSource={activityRows}
                columns={[
                  { key: "event", title: "事件" },
                  { key: "time", title: "时间" }
                ]}
              />
            )
          },
          {
            key: "settings",
            label: "设置",
            content: <Card title="维护窗口">每周巡检与固件策略均已生效。</Card>
          }
        ]}
      />
    </div>
  );
}

function FormExample() {
  return (
    <div className="example-page">
      <PageHeader title="新建项目" description="设置归属、范围与评审要求。" />
      <Stepper
        currentKey="basic"
        items={[
          { key: "basic", title: "基础信息" },
          { key: "review", title: "评审" }
        ]}
      />
      <FormSection title="基础信息" description="项目空间内通用的字段。">
        <Input label="项目名称" placeholder="请输入项目名称" />
        <Select
          label="负责人"
          placeholder="请选择负责人"
          options={[
            { label: "设计", value: "design" },
            { label: "研发", value: "engineering" }
          ]}
        />
        <Textarea label="范围说明" placeholder="请说明项目范围" />
      </FormSection>
      <div className="preview-actions">
        <Button variant="outline">取消</Button>
        <Button>保存</Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid") return <Badge variant="success">已支付</Badge>;
  if (status === "risk") return <Badge variant="danger">风险</Badge>;
  return <Badge variant="warning">待处理</Badge>;
}
