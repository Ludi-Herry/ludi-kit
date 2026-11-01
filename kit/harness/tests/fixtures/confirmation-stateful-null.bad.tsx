import { useState } from "react";
import { Button, ConfirmDialog, PageLayout } from "@ai-readable/kit";

type Row = { id: string };

export function ConfirmationStatefulNullPage() {
  const [target, setTarget] = useState<Row | null>(null);
  const [maybeTarget] = useState<Row | null>(null);

  return (
    <PageLayout>
      <Button danger onClick={() => setTarget(maybeTarget)}>删除</Button>
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
