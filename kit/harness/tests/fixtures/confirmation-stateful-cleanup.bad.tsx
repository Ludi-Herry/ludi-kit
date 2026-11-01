import { useState } from "react";
import { Button, ConfirmDialog, PageLayout } from "@ai-readable/kit";

type Decision = { action: "repair" | "scrap"; row: { id: string } };

export function ConfirmationStatefulCleanupPage() {
  const [decision, setDecision] = useState<Decision | null>(null);

  const confirmDecision = () => {
    if (!decision) return;
    if (decision.action === "scrap") return;
    setDecision(null);
  };

  return (
    <PageLayout>
      <Button danger onClick={() => setDecision({ action: "scrap", row: { id: "row-001" } })}>报废</Button>
      <ConfirmDialog
        danger={decision?.action === "scrap"}
        open={Boolean(decision)}
        title="确认报废设备？"
        description="报废后不可恢复"
        confirmLabel="确认报废"
        onCancel={() => setDecision(null)}
        onConfirm={confirmDecision}
      />
    </PageLayout>
  );
}
