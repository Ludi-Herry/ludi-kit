// 区块替换候选库：6 个用 antd 组件搭的区块，内容用与全部设备页相关的中文占位（设备、SN、机型）。
// 子端把选中的候选渲染到被替换区块的位置（只做画布预览，不写源码）；外壳只读取这里的元数据排序和展示。
// 样式沿用小豆盒页面已有的类名（device-ops-*），在 iframe 里与真实区块外观一致。

import type { ReactNode } from "react";
import { Alert, Button, Card, Empty, Form, Input, Segmented, Select, Space, Statistic, Table, Tag } from "antd";
import type { PageBlock, PageRegistry } from "./page-blocks";

export type BlockTemplateMeta = {
  id: string;
  name: string;
  description: string;
  /** 对应 patterns.manifest.json list-page.regions 的区域 id；没有对应区域为 null。 */
  region: "shell" | "filter" | "data" | null;
  /** 对应 list-page 的 requiredComponents / optionalComponents 里的名字；没有为 null。 */
  patternComponent: string | null;
};

export type BlockTemplate = BlockTemplateMeta & { render: () => ReactNode };

const sampleRows = [
  { sn: "TS24070101", model: "TS-100", status: "在网" },
  { sn: "TS24070102", model: "TS-100", status: "离线" },
  { sn: "TS24070215", model: "TS-200", status: "在网" }
];

function TitleArea() {
  return (
    <header className="device-ops-title-row">
      <h1 className="device-ops-title">设备总览</h1>
      <Space>
        <Segmented options={["全部", "生产阶段", "运行阶段", "售后阶段"]} defaultValue="全部" />
        <Button type="primary">新增设备</Button>
      </Space>
    </header>
  );
}

function FilterArea() {
  return (
    <section aria-label="筛选" className="device-ops-panel">
      <Form layout="vertical">
        <div className="device-ops-filters">
          <Form.Item label="SN">
            <Input allowClear placeholder="输入完整或部分 SN" />
          </Form.Item>
          <Form.Item label="机型">
            <Select allowClear options={[{ value: "TS-100", label: "TS-100" }, { value: "TS-200", label: "TS-200" }]} placeholder="全部机型" />
          </Form.Item>
          <Form.Item label="在网状态">
            <Select allowClear options={[{ value: "online", label: "在网" }, { value: "offline", label: "离线" }]} placeholder="全部" />
          </Form.Item>
        </div>
        <div className="device-ops-filters__actions">
          <span />
          <Space>
            <Button type="text">重置</Button>
            <Button type="primary">查询</Button>
          </Space>
        </div>
      </Form>
    </section>
  );
}

function DataTable() {
  return (
    <section aria-label="设备列表" className="device-ops-panel device-ops-panel--table">
      <div className="device-ops-toolbar">
        <span className="device-ops-toolbar__count">
          共 <strong className="device-ops-num">{sampleRows.length}</strong> 台设备
        </span>
        <Space>
          <Button>导出当前结果</Button>
        </Space>
      </div>
      <Table
        columns={[
          { title: "SN", dataIndex: "sn" },
          { title: "机型", dataIndex: "model" },
          { title: "在网状态", dataIndex: "status", render: (value: string) => <Tag color={value === "在网" ? "success" : "default"}>{value}</Tag> }
        ]}
        dataSource={sampleRows}
        pagination={false}
        rowKey="sn"
      />
    </section>
  );
}

function MetricRow() {
  const metrics: Array<[string, number]> = [["设备总数", 11], ["在网", 7], ["离线", 4], ["未处理告警", 2]];
  return (
    <section aria-label="指标" className="device-ops-phase">
      {metrics.map(([label, value]) => (
        <Card key={label} size="small">
          <Statistic title={label} value={value} />
        </Card>
      ))}
    </section>
  );
}

function NoticeBar() {
  return <Alert showIcon title="3 台设备离线超过 7 天，请尽快处理。" type="warning" />;
}

function BlankCard() {
  return (
    <section aria-label="空白卡片" className="device-ops-panel">
      <Empty description="在这里放置内容" />
    </section>
  );
}

export const BLOCK_TEMPLATES: BlockTemplate[] = [
  { id: "title-area", name: "标题区", description: "页面标题加视图切换和一个主按钮", region: "shell", patternComponent: "PageHeader", render: () => <TitleArea /> },
  { id: "filter-area", name: "筛选区", description: "三个常用筛选加重置、查询", region: "filter", patternComponent: "FilterPanel", render: () => <FilterArea /> },
  { id: "data-table", name: "数据表格", description: "工具栏加设备表格", region: "data", patternComponent: "DataGrid", render: () => <DataTable /> },
  { id: "metric-row", name: "指标卡行", description: "一行四张数字指标卡", region: null, patternComponent: null, render: () => <MetricRow /> },
  { id: "notice-bar", name: "提示条", description: "一条带图标的提醒", region: null, patternComponent: null, render: () => <NoticeBar /> },
  { id: "blank-card", name: "空白卡片", description: "留空的内容卡片，先占位", region: null, patternComponent: null, render: () => <BlankCard /> }
];

export function templateById(id: string): BlockTemplate | null {
  return BLOCK_TEMPLATES.find((item) => item.id === id) ?? null;
}

export type RankedTemplate = { template: BlockTemplateMeta; recommended: boolean };

// 候选排序：同区域类型排第一（标「推荐」），其次属于 list-page 必需组件的候选，再按库里的原顺序。
export function rankTemplates(registry: PageRegistry, block: PageBlock): RankedTemplate[] {
  const score = (item: BlockTemplateMeta) => {
    const sameRegion = Boolean(block.region && item.region === block.region.id);
    const required = item.patternComponent !== null && registry.requiredComponents.includes(item.patternComponent);
    return { sameRegion, required };
  };
  return BLOCK_TEMPLATES.map((template, index) => ({ template, index, ...score(template) }))
    .sort((a, b) => Number(b.sameRegion) - Number(a.sameRegion) || Number(b.required) - Number(a.required) || a.index - b.index)
    .map(({ template, sameRegion }) => ({ template: { id: template.id, name: template.name, description: template.description, region: template.region, patternComponent: template.patternComponent }, recommended: sameRegion }));
}
