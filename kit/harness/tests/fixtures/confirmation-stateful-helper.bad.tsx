import { useState } from "react";
import { Button, ConfirmDialog, PageLayout } from "@ai-readable/kit";

type Row = { id: string };
const row: Row = { id: "row-001" };

export function ConfirmationStatefulHelperPage() {
  const [target, setTarget] = useState<Row | null>(null);
  const openTarget = (next: Row) => setTarget(next);

  return (
    <PageLayout>
      <Button danger onClick={() => false && openTarget(row)}>删除</Button>
      <ConfirmDialog
        danger
        open={Boolean(target)}
        title="删除记录？"
        description="删除后不可恢复"
        confirmLabel="确认删除"
        onCancel={() => setTarget(null)}
        onConfirm={() => setTarget(null)}
      />
    </PageLayout>
  );
}
