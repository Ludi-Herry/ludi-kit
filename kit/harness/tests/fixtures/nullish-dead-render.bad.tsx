import { Badge, Button, FilterPanel, PageLayout } from "@ai-readable/kit";

type StatusCopyEntry = { label: string; variant: string };
const statusCopy = {
  inbound: {
    "pending-inspection": { label: "待验收", variant: "warning" }
  }
} as const;
type StatusGroup = keyof typeof statusCopy;

function StatusBadge({ group, status }: { group: StatusGroup; status: string }) {
  const table = statusCopy[group] as Record<string, StatusCopyEntry>;
  const copy: StatusCopyEntry = table[status] ?? { label: status, variant: "info" };
  return <Badge variant={copy.variant}>{copy.label}</Badge>;
}

export function NullishDeadRenderPage() {
  return (
    <PageLayout>
      {"visible" ?? (
        <>
          <FilterPanel fields={[]}>NULLISH_DEAD_COPY</FilterPanel>
          <StatusBadge group="inbound" status="pending-inspection" />
          <Button danger>空值删除</Button>
        </>
      )}
    </PageLayout>
  );
}
