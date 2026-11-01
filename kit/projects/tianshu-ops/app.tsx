import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Breadcrumb, Button, ConfigProvider, Layout, Menu } from "antd";
import {
  AppstoreOutlined,
  AuditOutlined,
  CheckSquareOutlined,
  CloseOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  DownOutlined,
  EnvironmentOutlined,
  HistoryOutlined,
  InboxOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  ThunderboltOutlined,
  UserOutlined
} from "@ant-design/icons";
import {
  TIANSHU_UNHANDLED_ACTION_EVENT,
  TianshuPageHeader as PageHeader,
  TianshuPageLayout as PageLayout
} from "./native-ui";
import { tianshuThemes } from "./native-theme";
import { TIANSHU_NOTICE_EVENT } from "./demo-actions";
import { generatedProjectPages } from "./generated/pages";
import { generatedProjectPages as goldenContentSchedulePages } from "./generated/content-schedule-current/pages";
import { generatedProjectPages as goldenRbacForbiddenPages } from "./generated/golden-rbac-forbidden/pages";
import "antd/dist/reset.css";
import "./app.css";

const appPrefix = "/tianshu";
const defaultPath = `${appPrefix}/dashboard`;
const GoldenContentSchedulePage = goldenContentSchedulePages[0].component;
const GoldenRbacForbiddenPage = goldenRbacForbiddenPages[0].component;

type TianshuPage = (typeof generatedProjectPages)[number];

const projectPages: TianshuPage[] = generatedProjectPages.map((page) => {
  if (page.id === "content-schedule") return { ...page, component: GoldenContentSchedulePage };
  if (page.id === "platform-rbac-forbidden") return { ...page, component: GoldenRbacForbiddenPage };
  return page;
});

type NavGroup = {
  label: string;
  pageIds: TianshuPage["id"][];
};

const navGroups: NavGroup[] = [
  { label: "总览", pageIds: ["dashboard"] },
  {
    label: "生产履约",
    pageIds: [
      "production-inbound",
      "production-flashing",
      "production-firmware",
      "production-sn-cert",
      "production-testing",
      "production-qc",
      "production-inventory",
      "production-shipping",
      "production-rma"
    ]
  },
  { label: "平台能力", pageIds: ["platform-rbac", "platform-audit"] },
  { label: "广告变现", pageIds: ["ad-campaigns", "ad-reconciliation"] },
  { label: "内容运营", pageIds: ["content-schedule", "content-version"] },
  { label: "验收辅助", pageIds: ["platform-rbac-forbidden"] }
];

const pageIconById: Partial<Record<TianshuPage["id"], ReactNode>> = {
  dashboard: <AppstoreOutlined aria-hidden="true" aria-label={undefined} />,
  "production-inbound": <InboxOutlined aria-hidden="true" aria-label={undefined} />,
  "production-flashing": <ThunderboltOutlined aria-hidden="true" aria-label={undefined} />,
  "production-firmware": <CloudServerOutlined aria-hidden="true" aria-label={undefined} />,
  "production-sn-cert": <SafetyCertificateOutlined aria-hidden="true" aria-label={undefined} />,
  "production-testing": <CheckSquareOutlined aria-hidden="true" aria-label={undefined} />,
  "production-qc": <AuditOutlined aria-hidden="true" aria-label={undefined} />,
  "production-inventory": <DatabaseOutlined aria-hidden="true" aria-label={undefined} />,
  "production-shipping": <SendOutlined aria-hidden="true" aria-label={undefined} />,
  "production-rma": <RollbackOutlined aria-hidden="true" aria-label={undefined} />,
  "platform-rbac": <UserOutlined aria-hidden="true" aria-label={undefined} />,
  "platform-audit": <AuditOutlined aria-hidden="true" aria-label={undefined} />,
  "platform-rbac-forbidden": <SafetyCertificateOutlined aria-hidden="true" aria-label={undefined} />,
  "ad-campaigns": <AppstoreOutlined aria-hidden="true" aria-label={undefined} />,
  "ad-reconciliation": <DatabaseOutlined aria-hidden="true" aria-label={undefined} />,
  "content-schedule": <SendOutlined aria-hidden="true" aria-label={undefined} />,
  "content-version": <HistoryOutlined aria-hidden="true" aria-label={undefined} />
};

const navLabelById: Partial<Record<TianshuPage["id"], string>> = {
  dashboard: "工作台",
  "production-flashing": "烧录发证",
  "platform-rbac-forbidden": "403 权限预览"
};

function normalizePath(pathname: string) {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return trimmed === appPrefix ? defaultPath : trimmed;
}

function toAppPath(route: string) {
  return `${appPrefix}${route}`;
}

function pageLabel(page: TianshuPage) {
  if (page.id === "platform-rbac-forbidden") return "账号与权限";
  const parts = page.title.split(" · ");
  return parts[parts.length - 1] ?? page.title;
}

function sectionLabel(page: TianshuPage | undefined) {
  if (!page) return "页面未找到";
  if (page.id === "platform-rbac-forbidden") return "平台共享能力";
  return navGroups.find((group) => group.pageIds.includes(page.id))?.label ?? "天枢";
}

function createNavMenuItems(pagesById: Map<TianshuPage["id"], TianshuPage>, groups = navGroups) {
  return groups.map((group) => ({
    key: `group:${group.label}`,
    label: group.label,
    type: "group" as const,
    children: group.pageIds.map((pageId) => {
      const page = pagesById.get(pageId)!;
      return {
        key: page.id,
        icon: pageIconById[page.id],
        label: <a href={toAppPath(page.route)}>{navLabelById[page.id] ?? pageLabel(page)}</a>
      };
    })
  }));
}

export function TianshuApp() {
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname));
  const themeName = new URLSearchParams(window.location.search).get("theme") === "calm" ? "calm" : "vivid";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pagesById = useMemo(() => new Map(projectPages.map((page) => [page.id, page])), []);
  const activeRoute = pathname.slice(appPrefix.length) || "/dashboard";
  const activePage = projectPages.find((page) => page.route === activeRoute);
  const isForbiddenPage = activePage?.id === "platform-rbac-forbidden";
  const navMenuItems = useMemo(() => {
    const groups = isForbiddenPage
      ? navGroups
          .filter((group) => group.label !== "验收辅助")
          .map((group) => group.label === "平台能力" ? { ...group, label: "平台共享能力" } : group)
      : navGroups;
    return createNavMenuItems(pagesById, groups);
  }, [isForbiddenPage, pagesById]);

  const navigate = (nextPath: string, replace = false) => {
    const normalized = normalizePath(nextPath);
    if (replace) window.history.replaceState({}, "", normalized);
    else window.history.pushState({}, "", normalized);
    setPathname(normalized);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  useEffect(() => {
    const normalized = normalizePath(window.location.pathname);
    if (normalized !== window.location.pathname) {
      window.history.replaceState({}, "", normalized);
    }
    setPathname(normalized);

    const onPopState = () => {
      setPathname(normalizePath(window.location.pathname));
      setMobileNavOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const showNotice = (message: string) => {
      if (!message) return;
      setNotice(message);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(""), 3600);
    };
    const onNotice = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      showNotice(message);
    };
    const onUnhandledAction = (event: Event) => {
      const label = (event as CustomEvent<{ label?: string }>).detail?.label || "该操作";
      showNotice(`“${label}”已触发。本地演示不会写入外部业务系统。`);
    };
    window.addEventListener(TIANSHU_NOTICE_EVENT, onNotice);
    window.addEventListener(TIANSHU_UNHANDLED_ACTION_EVENT, onUnhandledAction);
    return () => {
      window.removeEventListener(TIANSHU_NOTICE_EVENT, onNotice);
      window.removeEventListener(TIANSHU_UNHANDLED_ACTION_EVENT, onUnhandledAction);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    document.title = activePage ? `${pageLabel(activePage)} · 天枢运营管理平台` : "页面未找到 · 天枢运营管理平台";
  }, [activePage]);

  const handleNavClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith(`${appPrefix}/`)) return;
    event.preventDefault();
    if (normalizePath(url.pathname) !== pathname) navigate(url.pathname);
  };

  const handleContentClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname.startsWith(`${appPrefix}/`)) return;
    const targetPage = projectPages.find((page) => page.route === normalizePath(url.pathname));
    if (!targetPage) return;
    event.preventDefault();
    navigate(toAppPath(targetPage.route));
  };

  const ActivePage = activePage?.component;

  return (
    <ConfigProvider button={{ autoInsertSpace: false }} theme={tianshuThemes[themeName]}>
      <Layout className="tianshu-shell" data-theme={themeName}>
        <Layout.Sider breakpoint="md" className="tianshu-shell__sider" collapsible={false} width={256}>
          <nav className="tianshu-nav" data-mobile-open={mobileNavOpen ? "true" : "false"} onClick={handleNavClick}>
            <div className="tianshu-nav__head">
              <a className="tianshu-brand" href={defaultPath} aria-label="天枢运营管理平台工作台">
                <span className="tianshu-brand__mark">
                  <DeploymentUnitOutlined aria-hidden="true" aria-label={undefined} />
                </span>
                <span>
                  <strong>天枢</strong>
                  <small>运营管理平台</small>
                </span>
              </a>
              <button
                aria-controls="tianshu-navigation-groups"
                aria-expanded={mobileNavOpen}
                aria-label={mobileNavOpen ? "收起导航" : "展开导航"}
                className="tianshu-nav__toggle"
                onClick={() => setMobileNavOpen((open) => !open)}
                type="button"
              >
                {mobileNavOpen ? <CloseOutlined aria-hidden="true" aria-label={undefined} /> : <DownOutlined aria-hidden="true" aria-label={undefined} />}
              </button>
            </div>
            <div className="tianshu-nav__groups" id="tianshu-navigation-groups">
              <Menu
                className="tianshu-nav-menu"
                items={navMenuItems}
                mode="inline"
                selectedKeys={activePage ? [isForbiddenPage ? "platform-rbac" : activePage.id] : []}
              />
              <a className="tianshu-nav__lab-link" href="/">返回 Ludi Design Lab</a>
            </div>
          </nav>
        </Layout.Sider>
        <Layout className="tianshu-shell__main">
          <Layout.Header className="tianshu-shell__header">
            <div className="tianshu-topbar">
              <Breadcrumb
                className="tianshu-topbar__breadcrumb"
                items={[
                  { title: sectionLabel(activePage) },
                  { title: activePage ? pageLabel(activePage) : "页面未找到" }
                ]}
              />
              <div className="tianshu-topbar__account">
                <span><EnvironmentOutlined aria-hidden="true" aria-label={undefined} /> {isForbiddenPage ? "华南生产中心" : "华南运营中心"}</span>
                <span className="tianshu-topbar__divider" aria-hidden="true" />
                <span><UserOutlined aria-hidden="true" aria-label={undefined} /> {isForbiddenPage ? "运营专员 · 林川" : "运营管理员 · 周启明"}</span>
              </div>
            </div>
          </Layout.Header>
          <Layout.Content className="tianshu-shell__content" onClick={handleContentClick}>
            {activePage && ActivePage ? (
              <ActivePage />
            ) : (
              <PageLayout className="tianshu-not-found">
                <PageHeader
                  title="页面未找到"
                  description="当前地址不在天枢页面清单中。"
                  actions={<Button onClick={() => navigate(defaultPath, true)}>返回工作台</Button>}
                />
              </PageLayout>
            )}
          </Layout.Content>
        </Layout>
      </Layout>
      <div className={`tianshu-toast${notice ? " tianshu-toast--visible" : ""}`} role="status" aria-live="polite">
        {notice}
      </div>
    </ConfigProvider>
  );
}

export const tianshuAppRoutes = projectPages.map((page) => ({
  id: page.id,
  path: toAppPath(page.route),
  title: page.title
}));
