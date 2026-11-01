import { useState } from "react";
import { Button, ConfirmDialog, PageLayout } from "@ai-readable/kit";

export function ConfirmationStateGoodPage() {
  const [pendingRecord, setPendingRecord] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const closeDelete = () => setDeleteOpen(false);

  return (
    <PageLayout>
      <Button
        danger
        onClick={() => {
          setPendingRecord("parser-001");
          setDeleteOpen(true);
        }}
      >
        删除
      </Button>
      <ConfirmDialog
        open={deleteOpen}
        title="删除解析规则？"
        description="删除后数据不可恢复"
        confirmLabel="删除"
        danger
        onCancel={closeDelete}
        onConfirm={() => {
          setPendingRecord("");
          setDeleteOpen(false);
        }}
      />
      <span>{pendingRecord}</span>
    </PageLayout>
  );
}
