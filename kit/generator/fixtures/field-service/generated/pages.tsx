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

export type GeneratedPageId = "overview" | "work-orders" | "work-order-detail" | "dispatch";

export type GeneratedProjectPage = {
  id: GeneratedPageId;
  route: string;
  title: string;
  pattern: "dashboard-page" | "list-page" | "detail-page" | "form-page";
  component: () => ReactNode;
};

export const generatedProject = {
  "projectId": "field-service-control",
  "product": {
    "name": "现场服务调度台",
    "description": "帮助调度员分派工单、跟踪现场进度并核对服务结果。"
  }
} as const;

const workOrdersRows = [
  {
    "id": "WO-2407",
    "customer": "北岸实验室",
    "priority": "紧急",
    "owner": "林师傅"
  },
  {
    "id": "WO-2408",
    "customer": "新桥仓储",
    "priority": "常规",
    "owner": "待分派"
  }
];

function OverviewPage() {
  return (
    <PageLayout className="generated-page">
      <PageHeader title={"服务概览"} description={"在一屏内判断今日工单负载和超时风险。"} actions={<Button>查看超时工单</Button>} />
      <div className="generated-metric-grid">
        <MetricCard label={"待分派"} value={18} delta={"+3"} trend={"up"} />
        <MetricCard label={"现场处理中"} value={42} delta={"稳定"} trend={"flat"} />
        <MetricCard label={"超时风险"} value={5} delta={"-2"} trend={"down"} />
      </div>
      <Card title="验收标准"><ul className="generated-criteria"><li>首屏展示关键负载指标</li><li>主操作只有一个</li></ul></Card>
    </PageLayout>
  );
}

function WorkOrdersPage() {
  return (
    <PageLayout density="compact" className="generated-page">
      <PageHeader title={"工单列表"} description={"筛选需要处理的工单并进入详情或发起分派。"} actions={<Button>新建工单</Button>} />
      <FilterPanel fields={[
  {
    "name": "keyword",
    "label": "关键字",
    "type": "text",
    "placeholder": "工单号或客户"
  },
  {
    "name": "priority",
    "label": "优先级",
    "type": "select",
    "options": [
      {
        "label": "紧急",
        "value": "urgent"
      },
      {
        "label": "常规",
        "value": "normal"
      }
    ]
  }
]} />
      <DataSection title={"待处理工单"} toolbar={<Button variant="outline">导出</Button>}>
        <DataGrid
          rowKey={"id"}
          dataSource={workOrdersRows}
          columns={[
  {
    "key": "id",
    "title": "工单号"
  },
  {
    "key": "customer",
    "title": "客户"
  },
  {
    "key": "priority",
    "title": "优先级"
  },
  {
    "key": "owner",
    "title": "负责人"
  }
]}
          pagination={<Pagination pageSize={20} total={workOrdersRows.length} />}
        />
      </DataSection>
    </PageLayout>
  );
}

function WorkOrderDetailPage() {
  return (
    <PageLayout className="generated-page">
      <DetailHeader title={"工单 WO-2407"} subtitle={"核对工单上下文、负责人和服务时限。"} actions={<Button>更新进度</Button>} />
      <DescriptionGrid items={[
  {
    "label": "客户",
    "value": "北岸实验室"
  },
  {
    "label": "服务地址",
    "value": "研发园 2 号楼"
  },
  {
    "label": "负责人",
    "value": "林师傅"
  },
  {
    "label": "要求完成",
    "value": "今天 17:30"
  }
]} />
      <Card title="验收标准"><ul className="generated-criteria"><li>详情字段按语义分组</li><li>主操作对应当前任务</li></ul></Card>
    </PageLayout>
  );
}

function DispatchPage() {
  return (
    <PageLayout className="generated-page">
      <PageHeader title={"分派工单"} description={"为待处理工单选择负责人并补充现场说明。"} />
      <FormSection title="基础信息" description="按当前任务填写并复核字段。">
        <Input label={"工单号（必填）"} placeholder={"输入工单号"} />
        <Select label={"负责人（必填）"} placeholder={"请选择负责人"} options={[{"label":"林师傅","value":"lin"},{"label":"周师傅","value":"zhou"}]} />
        <Textarea label={"现场说明"} placeholder={"补充服务背景和注意事项"} />
      </FormSection>
      <div className="generated-actions">
        <Button variant="outline">取消</Button>
        <Button>确认分派</Button>
      </div>
    </PageLayout>
  );
}

export const generatedProjectPages: GeneratedProjectPage[] = [
  { id: "overview", route: "/overview", title: "服务概览", pattern: "dashboard-page", component: OverviewPage },
  { id: "work-orders", route: "/work-orders", title: "工单列表", pattern: "list-page", component: WorkOrdersPage },
  { id: "work-order-detail", route: "/work-orders/WO-2407", title: "工单 WO-2407", pattern: "detail-page", component: WorkOrderDetailPage },
  { id: "dispatch", route: "/dispatch", title: "分派工单", pattern: "form-page", component: DispatchPage }
];
