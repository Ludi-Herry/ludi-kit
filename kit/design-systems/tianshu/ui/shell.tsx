import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Breadcrumb, Button, ConfigProvider, Layout, Menu } from "antd";
import {
  CloseOutlined,
  DownOutlined,
  EnvironmentOutlined,
  UserOutlined
} from "@ant-design/icons";
import {
  TIANSHU_UNHANDLED_ACTION_EVENT,
  TianshuPageHeader as PageHeader,
  TianshuPageLayout as PageLayout
} from "./ui";
import { tianshuThemes } from "./theme";
import "antd/dist/reset.css";
import "./shell.css";

export type OpsPage = {
  id: string;
  route: string;
  title: string;
  component: () => ReactNode;
};

export type OpsNavGroup = {
  label: string;
  pageIds: string[];
};

export type OpsRelatedLink = {
  pageId: string;
  label?: string;
};

export type OpsPlatformShellProps = {
  appPrefix: string;
  appTitleSuffix: string;
  brand: { mark: ReactNode; name: string; sub: string; homeAria: string };
  pages: OpsPage[];
  navGroups: OpsNavGroup[];
  icons?: Partial<Record<string, ReactNode>>;
  navLabels?: Partial<Record<string, string>>;
  relatedLinksByPage?: Partial<Record<string, OpsRelatedLink[]>>;
  account: { site: string; user: string };
  labLinkHref?: string | null;
};

type DocumentWithViewTransitions = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function OpsPlatformShell({
  appPrefix,
  appTitleSuffix,
  brand,
  pages,
  navGroups,
  icons = {},
  navLabels = {},
  relatedLinksByPage = {},
  account,
  labLinkHref = "/"
}: OpsPlatformShellProps) {
  const defaultPath = `${appPrefix}/dashboard`;
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname, appPrefix, defaultPath));
  const themeName = new URLSearchParams(window.location.search).get("theme") === "calm" ? "calm" : "vivid";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pagesById = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages]);
  const activeRoute = pathname.slice(appPrefix.length) || "/dashboard";
  const activePage = pages.find((page) => page.route === activeRoute);
  const navMenuItems = useMemo(
    () =>
      navGroups.map((group) => ({
        key: `group:${group.label}`,
        label: group.label,
        type: "group" as const,
        children: group.pageIds.map((pageId) => {
          const page = pagesById.get(pageId)!;
          return {
            key: page.id,
            icon: icons[page.id],
            label: <a href={toAppPath(appPrefix, page.route)}>{navLabels[page.id] ?? pageLabel(page)}</a>
          };
        })
      })),
    [icons, navGroups, navLabels, pagesById, appPrefix]
  );

  const navigate = (nextPath: string, replace = false) => {
    const normalized = normalizePath(nextPath, appPrefix, defaultPath);
    const commit = () => {
      flushSync(() => setPathname(normalized));
      if (replace) window.history.replaceState({}, "", normalized);
      else window.history.pushState({}, "", normalized);
      setMobileNavOpen(false);
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    const doc = document as DocumentWithViewTransitions;
    if (doc.startViewTransition && !prefersReducedMotion()) {
      doc.startViewTransition(commit);
    } else {
      commit();
    }
  };

  useEffect(() => {
    const normalized = normalizePath(window.location.pathname, appPrefix, defaultPath);
    if (normalized !== window.location.pathname) {
      window.history.replaceState({}, "", normalized);
    }
    setPathname(normalized);

    const onPopState = () => {
      const next = normalizePath(window.location.pathname, appPrefix, defaultPath);
      const doc = document as DocumentWithViewTransitions;
      if (doc.startViewTransition && !prefersReducedMotion()) {
        doc.startViewTransition(() => flushSync(() => setPathname(next)));
      } else {
        setPathname(next);
      }
      setMobileNavOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [appPrefix, defaultPath]);

  useEffect(() => {
    const showNotice = (message: string) => {
      if (!message) return;
      setNotice(message);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(""), 3600);
    };
    const onUnhandledAction = (event: Event) => {
      const label = (event as CustomEvent<{ label?: string }>).detail?.label || "该操作";
      showNotice(`“${label}”已触发（未接入后端，不产生业务变更）。`);
    };
    window.addEventListener(TIANSHU_UNHANDLED_ACTION_EVENT, onUnhandledAction);
    return () => {
      window.removeEventListener(TIANSHU_UNHANDLED_ACTION_EVENT, onUnhandledAction);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    document.title = activePage ? `${pageLabel(activePage)} · ${appTitleSuffix}` : `页面未找到 · ${appTitleSuffix}`;
  }, [activePage, appTitleSuffix]);

  const handleNavClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith(`${appPrefix}/`)) return;
    event.preventDefault();
    if (normalizePath(url.pathname, appPrefix, defaultPath) !== pathname) navigate(url.pathname);
  };

  const handleContentClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname.startsWith(`${appPrefix}/`)) return;
    const targetPage = pages.find((page) => page.route === normalizePath(url.pathname, appPrefix, defaultPath));
    if (!targetPage) return;
    event.preventDefault();
    navigate(toAppPath(appPrefix, targetPage.route));
  };

  const ActivePage = activePage?.component;
  const relatedLinks = activePage
    ? (relatedLinksByPage[activePage.id] ?? [])
        .map((item) => {
          const target = pagesById.get(item.pageId);
          if (!target) return null;
          return { key: target.id, label: item.label ?? pageLabel(target), route: target.route };
        })
        .filter((item): item is { key: string; label: string; route: string } => item !== null)
    : [];

  return (
    <ConfigProvider button={{ autoInsertSpace: false }} theme={tianshuThemes[themeName]}>
      <Layout className="tianshu-shell" data-theme={themeName}>
        <Layout.Sider breakpoint="md" className="tianshu-shell__sider" collapsible={false} width={256}>
          <nav className="tianshu-nav" data-mobile-open={mobileNavOpen ? "true" : "false"} onClick={handleNavClick}>
            <div className="tianshu-nav__head">
              <a className="tianshu-brand" href={defaultPath} aria-label={brand.homeAria}>
                <span className="tianshu-brand__mark">{brand.mark}</span>
                <span>
                  <strong>{brand.name}</strong>
                  <small>{brand.sub}</small>
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
                selectedKeys={activePage ? [activePage.id] : []}
              />
              {labLinkHref ? (
                <a className="tianshu-nav__lab-link" href={labLinkHref}>返回 Ludi Design Lab</a>
              ) : null}
            </div>
          </nav>
        </Layout.Sider>
        <Layout className="tianshu-shell__main">
          <Layout.Header className="tianshu-shell__header">
            <div className="tianshu-topbar">
              <Breadcrumb
                className="tianshu-topbar__breadcrumb"
                items={[
                  { title: sectionLabel(activePage, navGroups, brand.name) },
                  { title: activePage ? pageLabel(activePage) : "页面未找到" }
                ]}
              />
              <div className="tianshu-topbar__account">
                <span><EnvironmentOutlined aria-hidden="true" aria-label={undefined} /> {account.site}</span>
                <span className="tianshu-topbar__divider" aria-hidden="true" />
                <span><UserOutlined aria-hidden="true" aria-label={undefined} /> {account.user}</span>
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
                  description={`当前地址不在${appTitleSuffix}页面清单中。`}
                  actions={<Button onClick={() => navigate(defaultPath, true)}>返回工作台</Button>}
                />
              </PageLayout>
            )}
            {relatedLinks.length > 0 ? (
              <nav aria-label="相关模块" className="tianshu-related">
                <span className="tianshu-related__label">相关模块</span>
                {relatedLinks.map((item) => (
                  <button
                    key={item.key}
                    className="tianshu-related__link"
                    onClick={() => navigate(toAppPath(appPrefix, item.route))}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            ) : null}
          </Layout.Content>
        </Layout>
      </Layout>
      <div className={`tianshu-toast${notice ? " tianshu-toast--visible" : ""}`} role="status" aria-live="polite">
        {notice}
      </div>
    </ConfigProvider>
  );
}

function normalizePath(pathname: string, appPrefix: string, defaultPath: string) {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return trimmed === appPrefix ? defaultPath : trimmed;
}

function toAppPath(appPrefix: string, route: string) {
  return `${appPrefix}${route}`;
}

function pageLabel(page: OpsPage) {
  const parts = page.title.split(" · ");
  return parts[parts.length - 1] ?? page.title;
}

function sectionLabel(page: OpsPage | undefined, navGroups: OpsNavGroup[], fallback: string) {
  if (!page) return "页面未找到";
  return navGroups.find((group) => group.pageIds.includes(page.id))?.label ?? fallback;
}
