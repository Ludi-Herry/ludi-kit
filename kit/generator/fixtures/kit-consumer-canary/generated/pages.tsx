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
} from "@ai-readable/kit";
import "./styles.css";

export type GeneratedPageId = "canary";

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = {
  "projectId": "kit-consumer-canary",
  "product": {
    "name": "Kit Consumer Canary",
    "description": "验证 kit-consumer 输出只从 @ai-readable/kit 公共入口导入。"
  }
} as const;



function CanaryPage() {
  return (
    <PageLayout className="generated-page">
      <PageHeader title={"Kit Consumer Canary"} description={"确认 @ai-readable/kit 公共入口仍可支撑生成页。"} actions={<Button>运行 canary</Button>} />
      <div className="generated-metric-grid">
        <MetricCard label={"公共入口"} value={"ok"} delta={"barrel"} trend={"flat"} />
        <MetricCard label={"模式"} value={"kit"} delta={"consumer"} trend={"flat"} />
      </div>
      <Card title="验收标准"><ul className="generated-criteria"><li>只导入 @ai-readable/kit</li><li>与 library-native fixture 分开计数</li></ul></Card>
    </PageLayout>
  );
}

export const generatedProjectPages: GeneratedProjectPage[] = [
  { id: "canary", route: "/canary", title: "Kit Consumer Canary", pattern: "dashboard-page", component: CanaryPage }
];
