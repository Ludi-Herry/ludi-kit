import { Button, Table } from "antd";

export function BadPermissionsListPage() {
  return (
    <div style={{ background: "#f5f7fb" }}>
      <h1>Permissions</h1>
      <Button type="primary">New role</Button>
      <Table dataSource={[]} columns={[]} />
    </div>
  );
}
