import {
  Badge,
  Button,
  DescriptionGrid,
  DetailHeader,
  PageLayout,
  Table,
  Tabs
} from "@ai-readable/kit";

export function DetailPageExample() {
  return (
    <PageLayout>
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
                dataSource={[
                  { id: "a1", event: "健康检查", time: "09:20" },
                  { id: "a2", event: "配置同步", time: "08:42" }
                ]}
                columns={[
                  { key: "event", title: "事件" },
                  { key: "time", title: "时间" }
                ]}
              />
            )
          }
        ]}
      />
    </PageLayout>
  );
}
