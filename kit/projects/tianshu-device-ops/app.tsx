import { useEffect, useMemo, useState } from "react";
import { App, Breadcrumb, Button, ConfigProvider, Input, Layout, Menu, Result, Space, Tooltip } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { DeploymentUnitOutlined, LockOutlined, UserOutlined } from "@ant-design/icons";
import { deviceOpsTheme, deviceOpsComponentStyles } from "./theme";
import { deviceOpsStore } from "./store";
import { FEEDBACK_ID_PATTERN, RMA_ID_PATTERN } from "./data";
import { APP_PREFIX, RouterContext, appPath, safeReturnTo } from "./ui";
import {
  AlertRulesPage,
  AlertsPage,
  BindingPage,
  DashboardPage,
  DeviceDetailPage,
  DeviceListPage,
  FeedbackPage,
  FirmwareFormPage,
  FirmwarePage,
  FlashingFormPage,
  FlashingPage,
  PassportDetailPage,
  PassportListPage,
  RmaPage
} from "./generated/pages";
import "antd/dist/reset.css";
import "./generated/styles.css";

dayjs.locale("zh-cn");

type NavItem = { route: string; label: string };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "工作台",
    items: [{ route: "/dashboard", label: "工作台" }]
  },
  {
    label: "设备生命周期",
    items: [
      { route: "/devices", label: "全部设备" },
      { route: "/lifecycle/inbound", label: "收货入库" },
      { route: "/lifecycle/flashing", label: "烧录发证" },
      { route: "/lifecycle/testing", label: "测试质检" },
      { route: "/lifecycle/shipping", label: "库存出货" },
      { route: "/lifecycle/passport", label: "数字护照" }
    ]
  },
  {
    label: "用户与激活",
    items: [
      { route: "/users/activation", label: "设备激活" },
      { route: "/users/binding", label: "用户与绑定" }
    ]
  },
  {
    label: "异常处置",
    items: [
      { route: "/alerts", label: "告警处置" },
      { route: "/exceptions/feedback", label: "客户反馈" },
      { route: "/exceptions/rma", label: "退货 RMA" }
    ]
  },
  {
    label: "系统配置",
    items: [
      { route: "/system/accounts", label: "账号与权限" },
      { route: "/system/firmware", label: "固件与推送" },
      { route: "/system/alert-rules", label: "告警规则" },
      { route: "/system/audit", label: "审计日志" }
    ]
  }
];

// 本账号已开通的菜单（2026-09-29 批 1 解锁：工作台 / 数字护照 / 退货 RMA / 固件与推送；
// 2026-09-29 批 2 解锁：烧录发证 / 客户反馈 / 告警规则 / 用户与绑定）；其余入口保持可见但置灰，说明原因，不让人点进去才发现没权限。
const openRoutes = new Set([
  "/dashboard",
  "/devices",
  "/alerts",
  "/lifecycle/passport",
  "/lifecycle/flashing",
  "/exceptions/rma",
  "/exceptions/feedback",
  "/system/firmware",
  "/system/alert-rules",
  "/users/binding"
]);

const allItems = navGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));

function readLocation() {
  const raw = window.location.pathname;
  const relative = raw.startsWith(APP_PREFIX) ? raw.slice(APP_PREFIX.length) : raw;
  const pathname = relative.length > 1 ? relative.replace(/\/+$/, "") : relative;
  return { pathname: pathname || "/", search: window.location.search };
}

function DeviceOpsShell() {
  const { message } = App.useApp();
  const [location, setLocation] = useState(readLocation);
  const [snQuery, setSnQuery] = useState("");
  const [requested, setRequested] = useState<string[]>([]);
  const { pathname, search } = location;

  const navigate = (to: string, replace = false) => {
    const url = new URL(to, window.location.origin);
    // 权限视角要跟着用户走，避免切页后按钮又变回可用。
    const perm = new URLSearchParams(window.location.search).get("perm");
    if (perm && !url.searchParams.has("perm")) url.searchParams.set("perm", perm);
    const target = `${url.pathname}${url.search}`;
    if (replace) window.history.replaceState({}, "", target);
    else window.history.pushState({}, "", target);
    setLocation(readLocation());
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  useEffect(() => {
    // 壳层根路径默认落地工作台（2026-09-29 批 1：工作台成为登录后的第一屏）。
    if (readLocation().pathname === "/") {
      window.history.replaceState({}, "", `${appPath("/dashboard")}${window.location.search}`);
      setLocation(readLocation());
    }
    const onPopState = () => setLocation(readLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // 站内锚点统一走 SPA（2026-09-29 集成修正）：
  // React 委托 onClick 会被 antd Menu 等组件在冒泡链路上 stopPropagation 截断，
  // Drawer / Modal / 轻提示又是 portal（在 Layout 之外）——这两种链接原来都会整页刷新，
  // 而本项目的运行态（告警处置、新建 RMA / 推送任务、工作台布局）全在内存 store 里，
  // 整页刷新会让刚产生的状态丢失（跨页动线断链）。
  // 因此改用 document 捕获阶段拦截：捕获先于各组件的冒泡 stopPropagation，
  // 且 portal 内锚点同样经过 document。命中站内地址即 preventDefault + navigate。
  useEffect(() => {
    const onClick = (event: globalThis.MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname !== APP_PREFIX && !url.pathname.startsWith(`${APP_PREFIX}/`)) return;
      event.preventDefault();
      // 阻止冒泡链上重复处理同一跳转（如工作台浮层条目的 React onClick 会再次 navigate）。
      event.stopImmediatePropagation();
      navigate(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
    // navigate 只依赖 window 与 setLocation，闭包安全。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deviceDetailMatch = /^\/devices\/([^/]+)$/.exec(pathname);
  const passportDetailMatch = /^\/lifecycle\/passport\/([^/]+)$/.exec(pathname);
  const firmwareEditMatch = /^\/system\/firmware\/([^/]+)\/edit$/.exec(pathname);
  const isFirmwareNew = pathname === "/system/firmware/new";
  const isFlashingNew = pathname === "/lifecycle/flashing/new";
  const navItem = allItems.find((item) => item.route === pathname);

  // 面包屑父级：设备详情按来源归组（告警处置来向沿用原逻辑），护照详情归数字护照，固件表单归固件与推送。
  const returnTo = useMemo(() => {
    if (!deviceDetailMatch) return null;
    return safeReturnTo(new URLSearchParams(search).get("from"));
  }, [deviceDetailMatch, search]);
  const fromAlerts = deviceDetailMatch ? returnTo?.startsWith(appPath("/alerts")) : false;
  let activeRoute = navItem?.route;
  let pageLabel = navItem?.label ?? "页面不存在";
  let groupLabel = navItem?.group ?? "任务中心";
  let parentItem: { route: string; label: string } | null = null;
  if (deviceDetailMatch) {
    activeRoute = fromAlerts ? "/alerts" : "/devices";
    pageLabel = decodeURIComponent(deviceDetailMatch[1]);
    groupLabel = fromAlerts ? "异常处置" : "设备生命周期";
    parentItem = fromAlerts ? { route: "/alerts", label: "告警处置" } : { route: "/devices", label: "全部设备" };
  } else if (passportDetailMatch) {
    activeRoute = "/lifecycle/passport";
    pageLabel = decodeURIComponent(passportDetailMatch[1]);
    groupLabel = "设备生命周期";
    parentItem = { route: "/lifecycle/passport", label: "数字护照" };
  } else if (isFirmwareNew || firmwareEditMatch) {
    activeRoute = "/system/firmware";
    pageLabel = isFirmwareNew ? "新建固件版本" : "编辑固件版本";
    groupLabel = "系统配置";
    parentItem = { route: "/system/firmware", label: "固件与推送" };
  } else if (isFlashingNew) {
    activeRoute = "/lifecycle/flashing";
    pageLabel = "新建烧录任务";
    groupLabel = "设备生命周期";
    parentItem = { route: "/lifecycle/flashing", label: "烧录发证" };
  }

  useEffect(() => {
    document.title = `${pageLabel} · 小豆盒运营管理平台`;
  }, [pageLabel]);

  const menuItems = useMemo(
    () =>
      navGroups.map((group) => ({
        key: `group:${group.label}`,
        type: "group" as const,
        label: group.label,
        children: group.items.map((item) =>
          openRoutes.has(item.route)
            ? { key: item.route, label: <a href={appPath(item.route)}>{item.label}</a> }
            : {
                key: item.route,
                disabled: true,
                label: (
                  <Tooltip placement="right" title={`当前账号未开通「${item.label}」，如需使用请联系管理员开通`}>
                    <span className="device-ops-menu__locked">
                      {item.label}
                      <LockOutlined aria-hidden="true" aria-label={undefined} />
                    </span>
                  </Tooltip>
                )
              }
        )
      })),
    []
  );

  const onSearch = (value: string) => {
    const query = value.trim();
    if (!query) return;
    // 全局搜索支持 RMA 单号直达退货 RMA 页（2026-09-29 批 1）、反馈编号直达客户反馈并打开对应工单（2026-09-29 批 2）。
    const normalized = query.toUpperCase();
    if (RMA_ID_PATTERN.test(normalized)) {
      navigate(`${appPath("/exceptions/rma")}?rma=${encodeURIComponent(normalized)}`);
    } else if (FEEDBACK_ID_PATTERN.test(normalized)) {
      navigate(`${appPath("/exceptions/feedback")}?ticket=${encodeURIComponent(normalized)}`);
    } else {
      const found = deviceOpsStore.getState().devices.find((device) => device.sn.toLowerCase() === query.toLowerCase());
      if (found) navigate(appPath(`/devices/${found.sn}`));
      else navigate(`${appPath("/devices")}?sn=${encodeURIComponent(query)}`);
    }
    setSnQuery("");
  };

  const breadcrumbItems = [
    { title: groupLabel },
    ...(parentItem ? [{ title: <a href={appPath(parentItem.route)}>{parentItem.label}</a> }] : []),
    { title: pageLabel }
  ];

  const backButton = <Button href={appPath("/dashboard")} type="primary">返回工作台</Button>;
  let content;
  if (deviceDetailMatch) content = <DeviceDetailPage sn={decodeURIComponent(deviceDetailMatch[1])} />;
  else if (passportDetailMatch) content = <PassportDetailPage sn={decodeURIComponent(passportDetailMatch[1])} />;
  else if (isFirmwareNew) content = <FirmwareFormPage id={null} />;
  else if (firmwareEditMatch) content = <FirmwareFormPage id={decodeURIComponent(firmwareEditMatch[1])} />;
  else if (isFlashingNew) content = <FlashingFormPage />;
  else if (pathname === "/lifecycle/flashing") content = <FlashingPage />;
  else if (pathname === "/exceptions/feedback") content = <FeedbackPage />;
  else if (pathname === "/system/alert-rules") content = <AlertRulesPage />;
  else if (pathname === "/users/binding") content = <BindingPage />;
  else if (pathname === "/devices") content = <DeviceListPage />;
  else if (pathname === "/alerts") content = <AlertsPage />;
  else if (pathname === "/dashboard") content = <DashboardPage />;
  else if (pathname === "/lifecycle/passport") content = <PassportListPage />;
  else if (pathname === "/exceptions/rma") content = <RmaPage />;
  else if (pathname === "/system/firmware") content = <FirmwarePage />;
  else if (navItem) {
    const applied = requested.includes(navItem.route);
    // 未开放页只作为直达链接的兜底；说明怎么开通，并给出申请入口。
    content = (
      <Result
        extra={
          <Space>
            <Button
              disabled={applied}
              onClick={() => {
                setRequested((current) => [...current, navItem.route]);
                message.success(`已向管理员提交「${navItem.label}」的开通申请，处理结果会通过站内信通知`);
              }}
              type="primary"
            >
              {applied ? "已提交申请" : "申请权限"}
            </Button>
            <Button href={appPath("/dashboard")}>返回工作台</Button>
          </Space>
        }
        status="403"
        subTitle={`「${navItem.label}」需要管理员开通。点击「申请权限」提交申请，审批结果会通过站内信通知；也可以直接联系华南运营中心管理员。`}
        title="该功能未对当前账号开放"
      />
    );
  } else {
    content = <Result extra={backButton} status="404" title="页面不存在" />;
  }

  return (
    <RouterContext.Provider value={{ pathname, search, navigate }}>
      <Layout className="device-ops-shell">
        <Layout.Sider className="device-ops-shell__sider" width={232}>
          <a className="device-ops-brand" href={appPath("/dashboard")} aria-label="小豆盒运营管理平台">
            <span className="device-ops-brand__mark">
              <DeploymentUnitOutlined aria-hidden="true" aria-label={undefined} />
            </span>
            <span>
              <strong>小豆盒</strong>
              <small>运营管理平台</small>
            </span>
          </a>
          <Menu className="device-ops-menu" items={menuItems} mode="inline" selectedKeys={activeRoute ? [activeRoute] : []} />
        </Layout.Sider>
        <Layout className="device-ops-shell__main">
          <Layout.Header className="device-ops-shell__header">
            <Breadcrumb items={breadcrumbItems} />
            <div className="device-ops-shell__tools">
              <Input.Search
                allowClear
                aria-label="按 SN、RMA 单号或反馈编号查找"
                className="device-ops-shell__search"
                onChange={(event) => setSnQuery(event.target.value)}
                onSearch={onSearch}
                placeholder="输入 SN、RMA 单号或反馈编号查找"
                value={snQuery}
              />
              <span className="device-ops-account">
                <UserOutlined aria-hidden="true" aria-label={undefined} />
                华南运营中心 · 运维 · 周启明
              </span>
            </div>
          </Layout.Header>
          <Layout.Content className="device-ops-shell__content">
            <div key={`${pathname}${search}`} className="device-ops-page">
              {content}
            </div>
          </Layout.Content>
        </Layout>
      </Layout>
    </RouterContext.Provider>
  );
}

export function DeviceOpsApp() {
  return (
    <ConfigProvider {...deviceOpsComponentStyles} button={{ ...deviceOpsComponentStyles.button, autoInsertSpace: false }} locale={zhCN} theme={deviceOpsTheme}>
      <App>
        <DeviceOpsShell />
      </App>
    </ConfigProvider>
  );
}
