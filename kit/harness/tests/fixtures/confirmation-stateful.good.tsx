import { useState } from "react";
import { Button, ConfirmDialog, PageLayout } from "@ai-readable/kit";

type Row = { id: string };
type Decision = { action: "repair" | "scrap"; row: Row };

const primaryRow: Row = { id: "row-001" };

type EmergencyPanelProps = {
  onEmergency: (row: Row) => void;
};

function EmergencyPanel({ onEmergency }: EmergencyPanelProps) {
  const row: Row = { id: "row-002" };
  return <Button danger onClick={() => onEmergency(row)}>紧急下架</Button>;
}

export function ConfirmationStatefulGoodPage() {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [emergencyRow, setEmergencyRow] = useState<Row | null>(null);

  const confirmDecision = () => {
    if (!decision) return;
    if (decision.action === "scrap") {
      void decision.row.id;
    }
    setDecision(null);
  };

  const confirmEmergency = () => {
    if (!emergencyRow) return;
    void emergencyRow.id;
    setEmergencyRow(null);
  };

  return (
    <PageLayout>
      <Button onClick={() => setDecision({ action: "repair", row: primaryRow })}>返修</Button>
      <Button danger onClick={() => setDecision({ action: "scrap", row: primaryRow })}>报废</Button>
      <Button danger onClick={() => setEmergencyRow(primaryRow)}>紧急下架</Button>
      <EmergencyPanel onEmergency={setEmergencyRow} />
      <ConfirmDialog
        danger={decision?.action === "scrap"}
        open={Boolean(decision)}
        title={decision?.action === "scrap" ? "确认报废设备？" : "确认进入返修链路？"}
        description={decision?.action === "scrap" ? "报废后不可恢复" : "返修后进入检测"}
        confirmLabel={decision?.action === "scrap" ? "确认报废" : "确认裁决"}
        onCancel={() => setDecision(null)}
        onConfirm={confirmDecision}
      />
      <ConfirmDialog
        danger
        open={Boolean(emergencyRow)}
        title="确认紧急下架？"
        description="操作会立即生效且不可撤销"
        confirmLabel="确认下架"
        onCancel={() => setEmergencyRow(null)}
        onConfirm={confirmEmergency}
      />
    </PageLayout>
  );
}
