import type { ReactNode } from "react";
import {
  Button,
  Card,
  DataGrid,
  DataSection,
  DescriptionGrid,
  DetailHeader,
  FilterPanel,
  FormSection,
  Input,
  MetricCard,
  PageHeader,
  PageLayout,
  Pagination,
  Select,
  Textarea
} from "./components";
import "./styles.css";

export type GeneratedPageId = "overview";

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = {
  "projectId": "custom-ops-workbench",
  "product": {
    "name": "自定义运维工作台",
    "description": "验证项目源码组件的 custom-native 输出。"
  }
} as const;



function OverviewPage() {
  return (
    <PageLayout className="generated-page">
      <PageHeader title={"运维概览"} description={"判断当日作业负载和待处理风险。"} actions={<Button>查看风险</Button>} />
      <div className="generated-metric-grid">
        <MetricCard label={"待处理"} value={12} delta={"+2"} trend={"up"} />
        <MetricCard label={"已完成"} value={36} delta={"稳定"} trend={"flat"} />
      </div>
      <Card title="验收标准"><ul className="generated-criteria"><li>使用本地源码组件导入</li><li>不导入第三方 UI 库</li></ul></Card>
    </PageLayout>
  );
}

export const generatedProjectPages: GeneratedProjectPage[] = [
  { id: "overview", route: "/overview", title: "运维概览", pattern: "dashboard-page", component: OverviewPage }
];
