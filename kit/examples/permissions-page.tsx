import { Badge, Button, DataGrid, DataSection, PageHeader, PageLayout } from "@ai-readable/kit";

const roles = [
  { id: "admin", name: "管理员", users: 4, status: "active" },
  { id: "auditor", name: "审计员", users: 7, status: "review" },
  { id: "guest", name: "访客", users: 2, status: "risk" }
];

const permissionStatusCopy = {
  active: { label: "启用", variant: "success" },
  review: { label: "复核中", variant: "warning" },
  risk: { label: "风险", variant: "danger" }
} as const;

export function PermissionsPageExample() {
  return (
    <PageLayout density="compact">
      <PageHeader title="权限管理" actions={<Button>新建角色</Button>} />
      <DataSection title="角色矩阵" toolbar={<Button variant="outline">审计日志</Button>}>
        <DataGrid
          rowSelection
          rowKey="id"
          dataSource={roles}
          columns={[
            { key: "name", title: "角色" },
            { key: "users", title: "用户数" },
            {
              key: "status",
              title: "状态",
              render: (record) => {
                const status = permissionStatusCopy[String(record.status) as keyof typeof permissionStatusCopy];
                return <Badge variant={status.variant}>{status.label}</Badge>;
              }
            }
          ]}
        />
      </DataSection>
    </PageLayout>
  );
}
