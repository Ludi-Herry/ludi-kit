import { useState } from "react";
import {
  AppShell,
  Badge,
  Button,
  Card,
  DataGrid,
  DataSection,
  FilterPanel,
  MetricCard,
  PageHeader,
  PageLayout,
  AIReadableProvider,
  SideNav,
  ThemeName,
  ThemeToggle
} from "@ai-readable/kit";

const rows = [
  { id: "ORD-1001", customer: "华云贸易", status: "paid", owner: "林承宇", updatedAt: "2026-07-06" },
  { id: "ORD-1002", customer: "示例科技", status: "pending", owner: "沈若桐", updatedAt: "2026-07-07" },
  { id: "ORD-1003", customer: "环宇实业", status: "risk", owner: "周砚秋", updatedAt: "2026-07-07" }
];

export function App() {
  const [theme, setTheme] = useState<Exclude<ThemeName, "screen">>("vivid");

  return (
    <AIReadableProvider theme={theme}>
      <AppShell
        nav={
          <SideNav
            activeKey="dashboard"
            items={[
              { key: "dashboard", label: "工作台" },
              { key: "orders", label: "订单" },
              { key: "settings", label: "设置" }
            ]}
          />
        }
        header={<ThemeToggle value={theme} onChange={setTheme} />}
      >
        <PageLayout>
          <PageHeader
            title="Ludi Design 起步模板"
            description="AI 生成产品页面的可运行外壳。"
            actions={<Button>新建流程</Button>}
          />

          <section className="starter-metrics">
            <MetricCard label="已生成页面" value="12" delta="今日 +3" trend="up" />
            <MetricCard label="校验问题" value="2" delta="-5" trend="down" />
            <MetricCard label="组件复用率" value="91" unit="%" delta="+8%" trend="up" />
          </section>

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

          <DataSection title="最近订单" toolbar={<Button variant="outline">导出</Button>}>
            <DataGrid
              rowKey="id"
              rowSelection
              dataSource={rows}
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
            />
          </DataSection>

          <Card title="生成规则">
            先读 kit manifest，再按 Layout → Module → Details 组装页面。
          </Card>
        </PageLayout>
      </AppShell>
    </AIReadableProvider>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid") return <Badge variant="success">已支付</Badge>;
  if (status === "risk") return <Badge variant="danger">风险</Badge>;
  return <Badge variant="warning">待处理</Badge>;
}
