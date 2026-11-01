import { Button, Dropdown } from "antd";

export function DropdownActionsPage({ record }: { record: { active: boolean } }) {
  return (
    <div>
      {record.active ? (
        <Dropdown
          menu={{ items: [
            { key: "edit", label: "编辑" },
            { key: "delete", label: "删除", danger: true }
          ] }}
        >
          <Button>更多操作</Button>
        </Dropdown>
      ) : null}
    </div>
  );
}
