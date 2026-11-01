import { useRef, useState } from "react";
import {
  Badge,
  BulkActionBar,
  Button,
  ConfirmDialog,
  DataGrid,
  DataSection,
  FilterPanel,
  Pagination,
  PageHeader,
  PageLayout
} from "@ai-readable/kit";

const rows = [
  { id: "ORD-1001", customer: "华云贸易", status: "paid", owner: "林承宇", updatedAt: "2026-07-06" },
  { id: "ORD-1002", customer: "示例科技", status: "pending", owner: "沈若桐", updatedAt: "2026-07-07" }
];

const orderStatusCopy = {
  paid: { label: "已支付", variant: "success" },
  pending: { label: "待处理", variant: "warning" }
} as const;

export function ListPageExample() {
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const listFocusRef = useRef<HTMLElement>(null);

  const confirmDelete = () => {
    setDeleteOpen(false);
    setSelectedRowKeys([]);
  };

  return (
    <PageLayout>
      <PageHeader
        title="订单管理"
        description="跟踪订单状态、负责人与最近更新。"
        actions={<Button>新建订单</Button>}
      />
      <FilterPanel
        fields={[
          { name: "keyword", label: "关键字", placeholder: "订单号或客户" },
          {
            name: "status",
            label: "状态",
            type: "select",
            options: [
              { label: "已支付", value: "paid" },
              { label: "待处理", value: "pending" }
            ]
          }
        ]}
      />
      <DataSection ref={listFocusRef} title="订单列表" toolbar={<Button variant="outline">导出</Button>}>
        <DataGrid
          rowKey="id"
          dataSource={rows}
          columns={[
            { key: "id", title: "订单号" },
            { key: "customer", title: "客户" },
            {
              key: "status",
              title: "状态",
              render: (record) => {
                const status = orderStatusCopy[record.status as keyof typeof orderStatusCopy];
                return <Badge variant={status.variant}>{status.label}</Badge>;
              }
            },
            { key: "owner", title: "负责人" },
            { key: "updatedAt", title: "更新时间" }
          ]}
          pagination={<Pagination pageSize={20} total={124} />}
          rowSelection
          selectedRowKeys={selectedRowKeys}
          onSelectionChange={setSelectedRowKeys}
        />
        <BulkActionBar selectedCount={selectedRowKeys.length} onClearSelection={() => setSelectedRowKeys([])}>
          <Button danger variant="outline" onClick={() => setDeleteOpen(true)}>删除选中订单</Button>
        </BulkActionBar>
      </DataSection>
      <ConfirmDialog
        danger
        confirmLabel={`删除 ${selectedRowKeys.length} 个订单`}
        description={`将永久删除当前选中的 ${selectedRowKeys.length} 个订单，删除后数据不可恢复。`}
        focusFallbackRef={listFocusRef}
        open={deleteOpen}
        title="删除选中订单？"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </PageLayout>
  );
}
