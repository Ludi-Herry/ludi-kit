import {
  AppShell,
  Badge,
  Button,
  Card,
  MetricCard,
  PageHeader,
  PageLayout,
  AIReadableProvider,
  SideNav,
  ThemeToggle
} from "@ai-readable/kit";

export function DashboardPageExample() {
  return (
    <AIReadableProvider theme="vivid">
      <AppShell
        nav={
          <SideNav
            activeKey="dashboard"
            items={[
              { key: "dashboard", label: "工作台" },
              { key: "orders", label: "订单" }
            ]}
          />
        }
        header={<ThemeToggle value="vivid" />}
      >
        <PageLayout>
          <PageHeader
            title="运营工作台"
            description="每日运营信号一屏过目。"
            actions={<Button>刷新</Button>}
          />
          <div className="demo-grid">
            <MetricCard label="营收" value="¥128 万" delta="+12%" trend="up" />
            <MetricCard label="待处理问题" value="18" delta="-4" trend="down" />
            <MetricCard label="SLA" value="98.4" unit="%" delta="+0.8%" trend="up" />
          </div>
          <Card title="告警" extra={<Badge variant="warning">3 条进行中</Badge>}>
            周报前先复核告警项。
          </Card>
        </PageLayout>
      </AppShell>
    </AIReadableProvider>
  );
}
