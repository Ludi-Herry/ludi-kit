import {
  Badge,
  Button,
  DataGrid,
  DataSection,
  FilterPanel,
  Pagination,
  PageHeader,
  PageLayout
} from "@ai-readable/kit";

const roles = [
  { id: "admin", name: "Admin", users: 4, status: "active", updatedAt: "2026-07-07" },
  { id: "auditor", name: "Auditor", users: 7, status: "review", updatedAt: "2026-07-06" },
  { id: "guest", name: "Guest", users: 2, status: "risk", updatedAt: "2026-07-05" }
];

const permissionStatusCopy = {
  active: { label: "Active", variant: "success" },
  review: { label: "Review", variant: "warning" },
  risk: { label: "Risk", variant: "danger" }
} as const;

export function PermissionsListPage() {
  return (
    <PageLayout density="compact">
      <PageHeader
        title="Permissions"
        description="Review role access, owners, and recent permission changes."
        actions={<Button>New role</Button>}
      />
      <FilterPanel
        fields={[
          { name: "keyword", label: "Keyword", placeholder: "Role or owner" },
          {
            name: "status",
            label: "Status",
            type: "select",
            options: [
              { label: "Active", value: "active" },
              { label: "Review", value: "review" }
            ]
          }
        ]}
      />
      <DataSection title="Role matrix" toolbar={<Button variant="outline">Export</Button>}>
        <DataGrid
          rowKey="id"
          rowSelection
          dataSource={roles}
          columns={[
            { key: "name", title: "Role" },
            { key: "users", title: "Users" },
            {
              key: "status",
              title: "Status",
              render: (record) => {
                const status = permissionStatusCopy[String(record.status) as keyof typeof permissionStatusCopy];
                return <Badge variant={status.variant}>{status.label}</Badge>;
              }
            },
            { key: "updatedAt", title: "Updated" }
          ]}
          pagination={<Pagination pageSize={25} total={48} />}
        />
      </DataSection>
    </PageLayout>
  );
}
