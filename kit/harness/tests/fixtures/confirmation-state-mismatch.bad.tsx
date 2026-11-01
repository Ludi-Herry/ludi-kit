import { useState } from "react";
import { Button, ConfirmDialog, PageLayout } from "@ai-readable/kit";

export function ConfirmationStateMismatchPage() {
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <PageLayout>
      <Button danger onClick={() => setTriggerOpen(true)}>删除</Button>
      <ConfirmDialog
        open={dialogOpen}
        title="删除解析规则？"
        description="删除后数据不可恢复"
        confirmLabel="删除"
        danger
        onCancel={() => setDialogOpen(false)}
        onConfirm={() => setDialogOpen(false)}
      />
    </PageLayout>
  );
}
