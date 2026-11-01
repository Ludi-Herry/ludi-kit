import { useState } from "react";
import { Button, ConfirmDialog, PageLayout } from "@ai-readable/kit";

type Row = { id: string };

type EmergencyPanelProps = {
  onEmergency: (row: Row) => void;
};

function EmergencyPanel({ onEmergency }: EmergencyPanelProps) {
  const row: Row = { id: "row-001" };
  return <Button danger onClick={() => onEmergency(row)}>紧急下架</Button>;
}

export function ConfirmationStatefulBridgePage() {
  const [emergencyRow, setEmergencyRow] = useState<Row | null>(null);
  const [, setOtherRow] = useState<Row | null>(null);

  return (
    <PageLayout>
      <EmergencyPanel onEmergency={setOtherRow} />
      <ConfirmDialog
        danger
        open={Boolean(emergencyRow)}
        title="确认紧急下架？"
        description="操作会立即生效且不可撤销"
        confirmLabel="确认下架"
        onCancel={() => setEmergencyRow(null)}
        onConfirm={() => setEmergencyRow(null)}
      />
    </PageLayout>
  );
}
