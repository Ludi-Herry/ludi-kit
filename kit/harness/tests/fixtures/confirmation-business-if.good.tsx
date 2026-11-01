import { useState } from "react";
import { Button, ConfirmDialog, PageLayout } from "@ai-readable/kit";

export function ConfirmationBusinessIfPage() {
  const [deleteTarget] = useState("parser-001");
  const [deleted, setDeleted] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <PageLayout>
      <Button danger onClick={() => setDeleteOpen(true)}>删除</Button>
      <ConfirmDialog
        open={deleteOpen}
        title="删除解析规则？"
        description="删除后数据不可恢复"
        confirmLabel="删除"
        danger
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (deleteTarget) setDeleted(true);
          setDeleteOpen(false);
        }}
      />
      <span>{deleted ? "已删除" : "待处理"}</span>
    </PageLayout>
  );
}
