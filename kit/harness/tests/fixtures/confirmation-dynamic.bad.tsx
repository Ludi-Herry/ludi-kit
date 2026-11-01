import { useState } from "react";
import { Button, ConfirmDialog, PageLayout } from "@ai-readable/kit";

export function ConfirmationDynamicPage() {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <PageLayout>
      <Button danger onClick={() => setDeleteOpen((current) => !current)}>删除</Button>
      <ConfirmDialog
        open={deleteOpen}
        title="删除解析规则？"
        description="删除后数据不可恢复"
        confirmLabel="删除"
        danger
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => setDeleteOpen(false)}
      />
    </PageLayout>
  );
}
