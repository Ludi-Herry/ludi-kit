import type { ComponentType } from "react";
import { appPath } from "../ui";
import { AlertRulesPage } from "./AlertRulesPage";
import { AlertsPage } from "./AlertsPage";
import { BindingPage } from "./BindingPage";
import { DashboardPage } from "./DashboardPage";
import { DeviceDetailPage } from "./DeviceDetailPage";
import { DeviceListPage } from "./DeviceListPage";
import { FeedbackPage } from "./FeedbackPage";
import { FirmwareFormPage } from "./FirmwareFormPage";
import { FirmwarePage } from "./FirmwarePage";
import { FlashingFormPage } from "./FlashingFormPage";
import { FlashingPage } from "./FlashingPage";
import { PassportDetailPage } from "./PassportDetailPage";
import { PassportListPage } from "./PassportListPage";
import { RmaPage } from "./RmaPage";

type AnyPageComponent = ComponentType<{ sn: string }> | ComponentType<{ id: string | null }> | ComponentType;

// 页面登记与 pages.json 一一对应，kit 的项目校验按 id 核对；路由匹配仍由 app.tsx 负责。
// 2026-09-29 批 2：flashing / flashing-form / feedback / alert-rules / binding 五页先挂占位组件，页面实现由本批页面会话完成。
export const generatedProjectPages: Array<{ id: string; route: string; path: string; title: string; component: AnyPageComponent }> = [
  { id: "device-list", route: "/devices", path: appPath("/devices"), title: "全部设备", component: DeviceListPage },
  { id: "device-detail", route: "/devices/:sn", path: appPath("/devices/:sn"), title: "设备详情", component: DeviceDetailPage },
  { id: "alerts", route: "/alerts", path: appPath("/alerts"), title: "告警处置", component: AlertsPage },
  { id: "dashboard", route: "/dashboard", path: appPath("/dashboard"), title: "工作台", component: DashboardPage },
  { id: "passport-list", route: "/lifecycle/passport", path: appPath("/lifecycle/passport"), title: "数字护照", component: PassportListPage },
  { id: "passport-detail", route: "/lifecycle/passport/:sn", path: appPath("/lifecycle/passport/:sn"), title: "数字护照详情", component: PassportDetailPage },
  { id: "rma", route: "/exceptions/rma", path: appPath("/exceptions/rma"), title: "退货 RMA", component: RmaPage },
  { id: "firmware", route: "/system/firmware", path: appPath("/system/firmware"), title: "固件与推送", component: FirmwarePage },
  { id: "firmware-form", route: "/system/firmware/new", path: appPath("/system/firmware/new"), title: "固件版本表单", component: FirmwareFormPage },
  { id: "flashing", route: "/lifecycle/flashing", path: appPath("/lifecycle/flashing"), title: "烧录发证", component: FlashingPage },
  { id: "flashing-form", route: "/lifecycle/flashing/new", path: appPath("/lifecycle/flashing/new"), title: "新建烧录任务", component: FlashingFormPage },
  { id: "feedback", route: "/exceptions/feedback", path: appPath("/exceptions/feedback"), title: "客户反馈", component: FeedbackPage },
  { id: "alert-rules", route: "/system/alert-rules", path: appPath("/system/alert-rules"), title: "告警规则", component: AlertRulesPage },
  { id: "binding", route: "/users/binding", path: appPath("/users/binding"), title: "用户与绑定", component: BindingPage }
];

export {
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
};
